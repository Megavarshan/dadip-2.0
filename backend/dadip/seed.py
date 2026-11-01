"""Seed an empty database.

    python -m dadip.seed --admin-email you@org.in            # password read from DADIP_SEED_ADMIN_PASSWORD,
                                                             # or generated and printed once
    python -m dadip.seed --demo                              # add labelled demo incidents and resources

Demo rows carry data_origin="demo" so the command centre can label them; they are taken from the original
DADIP seed data and are illustrative, not live observations.
"""

import argparse
import os
import secrets

from sqlalchemy import func, select

from dadip.core.security import hash_password
from dadip.db.models import ChannelConfig, Incident, Resource, User
from dadip.db.session import get_sessionmaker

DEMO_INCIDENTS = [
    ("flood", "Severe flooding - Assam", "Brahmaputra above danger mark; 15 districts affected.", "critical",
     26.1, 91.7, "Assam", 200000),
    ("flood", "Flash flood warning - Kerala", "Heavy rainfall in Wayanad and Idukki districts.", "high",
     10.0, 76.3, "Kerala", None),
    ("flood", "River overflow - Bihar", "Kosi overflow affecting Supaul and Saharsa.", "high",
     25.6, 85.1, "Bihar", 150000),
    ("cyclone", "Cyclone warning - Bay of Bengal", "Depression likely to cross Andhra Pradesh coast.", "high",
     16.5, 86.0, "Andhra Pradesh", None),
    ("earthquake", "M4.2 - 30 km N of Imphal", "Moderate tremors across Manipur valley.", "moderate",
     25.1, 94.0, "Manipur", None),
    ("tsunami", "Tsunami watch - Indian Ocean", "Minor advisory after offshore earthquake.", "moderate",
     6.0, 80.0, None, None),
]

DEMO_RESOURCES = [
    ("NDRF Battalion 4", "ndrf", 13.0, 80.2, "Arakkonam, Tamil Nadu", 400, 0, "Tamil Nadu"),
    ("District Hospital Guwahati", "hospital", 26.1, 91.7, "Guwahati, Assam", 300, 120, "Assam"),
    ("Flood Relief Camp - Patna", "relief_camp", 25.6, 85.1, "Patna, Bihar", 1000, 650, "Bihar"),
    ("SDRF Centre Thiruvananthapuram", "shelter", 8.5, 76.9, "Thiruvananthapuram, Kerala", 200, 45, "Kerala"),
    ("Cyclone Shelter Visakhapatnam", "shelter", 17.7, 83.3, "Visakhapatnam, Andhra Pradesh", 800, 0,
     "Andhra Pradesh"),
    ("NDRF Battalion 12", "ndrf", 19.0, 72.8, "Mumbai, Maharashtra", 450, 0, "Maharashtra"),
]

CHANNELS = [("mock_sms", True), ("mock_whatsapp", True), ("telegram", False), ("mqtt", False),
            ("websocket", False), ("webhook", False)]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--admin-email")
    p.add_argument("--demo", action="store_true")
    args = p.parse_args()

    with get_sessionmaker()() as db:
        for name, is_mock in CHANNELS:
            if not db.get(ChannelConfig, name):
                db.add(ChannelConfig(name=name, enabled=True, is_mock=is_mock))

        if args.admin_email:
            email = args.admin_email.lower()
            if db.scalar(select(User.id).where(func.lower(User.email) == email)):
                print(f"admin {email} already exists")
            else:
                password = os.environ.get("DADIP_SEED_ADMIN_PASSWORD") or None  # empty means unset
                generated = password is None
                password = password or secrets.token_urlsafe(16)
                db.add(User(email=email, name="Administrator", role="admin", password_hash=hash_password(password)))
                print(f"created admin {email}" + (f" with generated password: {password}" if generated else ""))

        has_demo = db.scalar(select(func.count()).select_from(Incident).where(Incident.data_origin == "demo"))
        if args.demo and not has_demo:
            for hz, title, desc, sev, lat, lon, region, pop in DEMO_INCIDENTS:
                db.add(Incident(hazard_type=hz, title=title, description=desc, severity=sev, latitude=lat,
                                longitude=lon, region=region, affected_population=pop, source="demo",
                                data_origin="demo"))
            for name, kind, lat, lon, addr, cap, occ, region in DEMO_RESOURCES:
                db.add(Resource(name=name, kind=kind, latitude=lat, longitude=lon, address=addr, capacity=cap,
                                occupancy=occ, region=region, data_origin="demo"))
            print(f"added {len(DEMO_INCIDENTS)} demo incidents and {len(DEMO_RESOURCES)} demo resources")
        db.commit()


if __name__ == "__main__":
    main()
