"""Fixed multilingual alert headers (English, Hindi, Tamil).

Only the standard header (alert level + hazard + area) is translated, from these reviewed phrase tables.
The operator's free-text body is sent as written, in the language the operator chose: DADIP does not machine-
translate emergency instructions. Hindi and Tamil phrases should be confirmed by a native speaker before any
real deployment (tracked in docs/status.md).
"""

LEVEL = {
    "en": {"red": "RED ALERT", "orange": "ORANGE ALERT", "yellow": "YELLOW ALERT", "green": "ADVISORY"},
    "hi": {"red": "रेड अलर्ट", "orange": "ऑरेंज अलर्ट", "yellow": "येलो अलर्ट", "green": "सूचना"},
    "ta": {"red": "சிவப்பு எச்சரிக்கை", "orange": "ஆரஞ்சு எச்சரிக்கை", "yellow": "மஞ்சள் எச்சரிக்கை",
           "green": "அறிவிப்பு"},
}
HAZARD = {
    "en": {"flood": "Flood", "cyclone": "Cyclone", "earthquake": "Earthquake", "tsunami": "Tsunami",
           "landslide": "Landslide", "fire": "Fire", "heatwave": "Heatwave", "other": "Emergency"},
    "hi": {"flood": "बाढ़", "cyclone": "चक्रवात", "earthquake": "भूकंप", "tsunami": "सुनामी",
           "landslide": "भूस्खलन", "fire": "आग", "heatwave": "लू", "other": "आपदा"},
    "ta": {"flood": "வெள்ளம்", "cyclone": "புயல்", "earthquake": "நிலநடுக்கம்", "tsunami": "சுனாமி",
           "landslide": "நிலச்சரிவு", "fire": "தீ", "heatwave": "வெப்ப அலை", "other": "பேரிடர்"},
}
SUPPORTED = tuple(LEVEL)


def header(level: str, hazard: str, area: str, language: str) -> str:
    lang = language if language in SUPPORTED else "en"
    return f"{LEVEL[lang][level]}: {HAZARD[lang].get(hazard, HAZARD[lang]['other'])} — {area}"
