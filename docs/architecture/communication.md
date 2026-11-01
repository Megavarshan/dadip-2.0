# Resilient Communication Engine

## Lifecycle

```
operator creates alert ──► AURA level + decision ──► requires approval?
        │                                              │ yes            │ no
        │                                      pending_approval     approved
        │                         approver (not the creator) ─┬─► rejected
        │                                                     ▼
        └──────────────────────────────────────────► approved ─► messages queued (one per channel)
                                                                     │
                         dispatcher claims (FOR UPDATE SKIP LOCKED) ─┘
                                 │
     ┌──────────── success ──────┼──── transient error ────┬──── permanent error
     ▼                           ▼                          ▼
 delivered ─► acknowledged   retry_scheduled (backoff)    failed
                             │  after max attempts → failed
                             │  past TTL → expired
```

Every transition is a `message_events` row; every send is a `delivery_attempts` row.

## Guarantees and how they are enforced

| Guarantee | Mechanism | Test |
| --- | --- | --- |
| No high-impact alert without a human | `requires_approval` policy; messages created only on approval | `test_alert_requires_approval_and_sends_nothing_before` |
| Four-eyes approval | creator cannot approve own alert (admin excepted) | `test_four_eyes_rule` |
| Duplicate suppression | alert-level 409 for an identical active alert; unique `idempotency_key` per (incident, level, area, channel, recipient, content, 15-min window) | `test_duplicate_alert_rejected_and_messages_deduplicated` |
| At-most-one concurrent attempt | `FOR UPDATE SKIP LOCKED` claim | `test_two_dispatchers_never_double_send` (4 workers, 40 messages, 40 attempts) |
| Retry with bounded backoff | full-jitter exponential, base 2 s, cap 120 s, 6 attempts | `test_retry_then_success_records_every_attempt` |
| Never deliver stale alerts | TTL checked before claim and before scheduling a retry | `test_ttl_expiry_never_sends_late` |
| Store-and-forward on channel outage | disabled channel's messages stay queued, sent on re-enable | `test_disabled_channel_holds_messages_in_outbox` |
| Acks not lost to timing | ack `UPDATE` waits on the dispatcher's row lock | `test_ack_arriving_during_send_is_not_lost` |

## What "delivered" means per channel

| Channel | Real? | Success means |
| --- | --- | --- |
| `mock_sms`, `mock_whatsapp` | mock | the mock accepted it; no real network |
| `mqtt` | real (Mosquitto) | broker PUBACK for a QoS 1 publish |
| `websocket` | real (Redis pub/sub) | published to the live-update bus |
| `webhook` | real if `DADIP_WEBHOOK_URL` set | receiver answered 2xx (429 / 5xx retried, other 4xx fail) |
| `telegram` | real if bot token and chat id set | Bot API returned `ok: true` |

End-user acknowledgement is separate: devices publish to `dadip/acks` over MQTT, or call
`POST /api/v1/messages/{id}/ack?token=…` with the HMAC token carried in the alert payload.

## Multilingual alerts

Headers ("RED ALERT: Flood — area") come from fixed English / Hindi / Tamil phrase tables. The operator's body
text is sent as written; DADIP does not machine-translate emergency instructions. Hindi and Tamil tables need
native-speaker review before real use.
