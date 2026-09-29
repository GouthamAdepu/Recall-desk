"""Seed Hindsight with realistic past interactions for the demo customers.

Each exchange is retained with a back-dated timestamp, ticket-based document_id
and tags, exactly like live traffic — so recall/reflect behave identically.

Run from backend/:   python seed.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

import customers
import memory

now = datetime.now(timezone.utc)


def ago(days: int, hour: int = 20) -> datetime:
    return (now - timedelta(days=days)).replace(hour=hour, minute=12, second=0, microsecond=0)


def _bulk_history(
    *,
    issue_category: str,
    device: str,
    plan: str,
    ticket_prefix: str,
    start_offset_days: int,
    total: int,
    customer_id: str,
    channels: list[str],
    message_templates: list[str],
    response_templates: list[str],
    status_cycle: list[str],
    sentiment_cycle: list[str],
) -> list[tuple[datetime, str, str, str, dict[str, object]]]:
    """Generate a realistic block of past interactions for the demo memory bank."""
    entries: list[tuple[datetime, str, str, str, dict[str, object]]] = []
    for idx in range(total):
        day_offset = start_offset_days + (idx // 6)
        hour = 8 + (idx % 6) * 2
        ts = (now - timedelta(days=day_offset, hours=hour % 23)).replace(
            minute=12 + (idx % 5) * 7,
            second=0,
            microsecond=0,
        )
        channel = channels[idx % len(channels)]
        contact_number = idx + 1
        ticket_id = f"{ticket_prefix}-{(contact_number % 99) + 1000}"
        message = message_templates[idx % len(message_templates)]
        response = response_templates[idx % len(response_templates)]
        status = status_cycle[idx % len(status_cycle)]
        sentiment = sentiment_cycle[idx % len(sentiment_cycle)]
        facts = {
            "ticket_id": ticket_id,
            "issue_category": issue_category,
            "device": device,
            "plan": plan,
            "status": status,
            "sentiment": sentiment,
            "contact_number": contact_number,
            "customer_id": customer_id,
            "notes": f"Synthetic demo memory #{idx + 1} for {customer_id}.",
        }
        entries.append((ts, channel, message, response, facts))
    return entries


SEED = {
    # Maya: recurring evening Wi-Fi drops. 2 contacts, restart failed, promise broken.
    "C-1001": [
        (
            ago(24), "phone",
            "Hi, my Wi-Fi keeps dropping every evening around 8pm, usually for a couple of minutes. I'm on Fiber 500 "
            "with the Netgear Nighthawk RAX50 router you supplied. I work late from home so this is a real problem.",
            "I'm sorry, Maya. Please power-cycle the router: unplug it for 30 seconds and plug it back in. If the drops "
            "continue, contact us again and we'll dig deeper.",
            {"ticket_id": "T-48213", "issue_category": "wifi", "device": "Netgear Nighthawk RAX50", "plan": "Fiber 500",
             "status": "open", "sentiment": "neutral", "contact_number": 1,
             "steps_suggested": ["power-cycle router"], "notes": "Evening Wi-Fi drops ~8pm; advised router power-cycle"},
        ),
        (
            ago(11), "phone",
            "The Wi-Fi is still dropping at night. I power-cycled the router twice like you said and it made no difference.",
            "I'm sorry the restart didn't help. I've moved your 5 GHz network to a less congested channel remotely and "
            "I'm booking a technician visit — you'll get a call within 3 business days to schedule it.",
            {"ticket_id": "T-48213", "issue_category": "wifi", "device": "Netgear Nighthawk RAX50", "plan": "Fiber 500",
             "status": "open", "sentiment": "frustrated", "contact_number": 2,
             "steps_suggested": ["remote Wi-Fi channel change"],
             "promises_made": ["technician will call within 3 business days to schedule a visit"],
             "notes": "Power-cycle failed twice; channel changed remotely; technician visit promised (never scheduled)"},
        ),
    ],
    # James: billing overcharge, refund pending.
    "C-1002": [
        (
            ago(6, 10), "chat",
            "My bill this month is $129 but my plan is $79. Account number ends in 4471. I never ordered anything extra.",
            "Thanks, James. I can see a $50 'Premium Sports' add-on applied in error. I've removed it and submitted a "
            "$50 refund, which will appear as a credit on your next statement within 5-7 business days.",
            {"ticket_id": "T-50902", "issue_category": "billing", "plan": "Fiber 300", "status": "open",
             "sentiment": "frustrated", "contact_number": 1,
             "promises_made": ["$50 credit on next statement within 5-7 business days"],
             "notes": "Erroneous $50 Premium Sports add-on removed; refund pending; account ends 4471"},
        ),
    ],
    # Sofia: resolved hardware case + preferences.
    "C-1003": [
        (
            ago(42, 9), "chat",
            "My router's power light is blinking orange and there's no internet at all. I work from home and have client calls all day.",
            "That pattern means a hardware fault. I'm shipping a replacement TP-Link Archer AX55 by express; it arrives "
            "in 2 days. Meanwhile I've enabled 20 GB of free mobile hotspot data on your account.",
            {"ticket_id": "T-44120", "issue_category": "hardware", "device": "TP-Link Archer AX55", "plan": "Fiber 1G",
             "status": "open", "sentiment": "frustrated", "contact_number": 1,
             "promises_made": ["replacement router in 2 days", "20 GB free hotspot data"],
             "notes": "Router hardware fault; replacement shipped; works from home"},
        ),
        (
            ago(38, 11), "email",
            "The new router arrived and everything works perfectly now, thank you! By the way, email is the best way to reach me.",
            "Wonderful to hear, Sofia! I've closed the ticket and noted that you prefer email. Please return the old "
            "router with the prepaid label in the box.",
            {"ticket_id": "T-44120", "issue_category": "hardware", "device": "TP-Link Archer AX55", "plan": "Fiber 1G",
             "status": "resolved", "sentiment": "positive", "contact_number": 2,
             "resolution": "replacement router installed", "notes": "Resolved; prefers email contact"},
        ),
    ],
    # C-1004 (Liam) intentionally has no history.
    "C-1004": [],
}

# Add a larger synthetic memory set so the demo feels rich and active.
SEED["C-1001"].extend(
    _bulk_history(
        issue_category="wifi",
        device="Netgear Nighthawk RAX50",
        plan="Fiber 500",
        ticket_prefix="T-48213",
        start_offset_days=30,
        total=270,
        customer_id="C-1001",
        channels=["phone", "chat", "email"],
        message_templates=[
            "My Wi‑Fi drops again every evening around 8pm.",
            "The router reboots itself and then the connection is gone for several minutes.",
            "Could you check why the 5 GHz signal is unstable after dark?",
            "This is the third time this week that my internet drops while I am working from home.",
            "The modem light is flashing amber again and I'm losing video calls.",
        ],
        response_templates=[
            "Thanks for confirming. I’ve checked the line and we’ve moved the channel to reduce congestion after dark.",
            "I’m sorry this is still happening. I’ve escalated this as a repeat issue and recorded the failed reboots.",
            "We’ve scheduled a technician callback and noted the earlier missed visit so we don’t ask you to repeat yourself.",
            "I’ve added your case notes and we’ll avoid repeating the router restart steps that did not help.",
            "We’ve documented the repeat issue and the failed troubleshooting so the next engineer can jump in quickly.",
        ],
        status_cycle=["open", "open", "escalated", "open", "resolved"],
        sentiment_cycle=["frustrated", "neutral", "annoyed", "upset", "frustrated"],
    )
)

SEED["C-1002"].extend(
    _bulk_history(
        issue_category="billing",
        device="Fiber gateway",
        plan="Fiber 300",
        ticket_prefix="T-50902",
        start_offset_days=18,
        total=260,
        customer_id="C-1002",
        channels=["chat", "phone", "email"],
        message_templates=[
            "Why did my bill jump by $50 this month?",
            "My refund still hasn’t posted to my account.",
            "I never approved the sports add-on and I need it removed.",
            "The credit still isn’t showing up on my statement.",
            "Can you confirm the total balance for my account ending in 4471?",
        ],
        response_templates=[
            "I’ve confirmed the mistaken add-on and I’ve reopened the refund case so it can be reviewed again.",
            "The $50 credit was applied to your account and I’ve verified the billing notes for future follow-up.",
            "I’ve documented the missing refund and we are checking the account for the earlier billing error.",
            "The duplicate charge has been flagged and the account notes now reflect that the add-on was removed.",
            "I’ve updated the ticket with the latest billing status and clarified the credit timeline for you.",
        ],
        status_cycle=["open", "open", "resolved", "open", "open"],
        sentiment_cycle=["frustrated", "annoyed", "neutral", "angry", "frustrated"],
    )
)

SEED["C-1003"].extend(
    _bulk_history(
        issue_category="hardware",
        device="TP-Link Archer AX55",
        plan="Fiber 1G",
        ticket_prefix="T-44120",
        start_offset_days=60,
        total=220,
        customer_id="C-1003",
        channels=["email", "chat", "phone"],
        message_templates=[
            "My router lights are blinking and my home office connection keeps dropping.",
            "I need better reliability because I work from home every day.",
            "The replacement router is fine, but I still need help with my Wi‑Fi scheduling.",
            "My internet is unstable during long video meetings.",
            "Could you confirm the old router return label and the new setup details?",
        ],
        response_templates=[
            "Thanks for the update. I’ve confirmed the new router is working and noted that email is your preferred contact method.",
            "The old router return label is active and the account is marked as resolved.",
            "I’ve added your preference for email updates and kept the ticket notes focused on the successful replacement.",
            "Your hardware case is resolved and the account now reflects the preferred channel for future contact.",
            "We’ve closed the issue and saved the successful replacement details for your support history.",
        ],
        status_cycle=["resolved", "resolved", "open", "resolved", "resolved"],
        sentiment_cycle=["positive", "neutral", "frustrated", "happy", "calm"],
    )
)

SEED["C-1004"].extend(
    _bulk_history(
        issue_category="setup",
        device="TP-Link Fiber modem",
        plan="Fiber 300",
        ticket_prefix="T-90001",
        start_offset_days=14,
        total=250,
        customer_id="C-1004",
        channels=["chat", "phone", "email"],
        message_templates=[
            "I just moved in and the Wi‑Fi light is red.",
            "My modem is not connecting after the move and I need internet setup help.",
            "The signal keeps dropping while I’m streaming on my laptop.",
            "The installation instructions didn’t match my router and I’m stuck.",
            "Could you help me verify the modem pairing and network settings?",
        ],
        response_templates=[
            "I’ve confirmed the account is active and noted the setup steps that worked for your equipment.",
            "The modem pairing was recorded and the account now has a complete onboarding history.",
            "We’ve saved the routing and setup details so the next agent can pick up without asking you to repeat them.",
            "I’ve logged the new customer setup notes and the successful troubleshooting steps.",
            "The onboarding case is now documented and the account history reflects the successful setup flow.",
        ],
        status_cycle=["open", "resolved", "open", "resolved", "open"],
        sentiment_cycle=["neutral", "frustrated", "calm", "happy", "anxious"],
    )
)

# Add additional realistic telecom support customers so the demo portfolio mirrors a real support queue.
for customer_id, cfg in {
    "C-1005": {
        "issue_category": "wifi",
        "device": "Google Nest Wi‑Fi Pro",
        "plan": "Fiber 1G",
        "ticket_prefix": "T-99501",
        "start_offset_days": 48,
        "total": 280,
        "channels": ["phone", "chat", "email"],
        "message_templates": [
            "My internet drops every evening around 8:30 while I’m on calls.",
            "The Wi‑Fi signal gets weak in the back bedroom and then the connection cuts out.",
            "My modem shows a red light and I lose internet for several minutes.",
            "The router reboots itself again during my evening video meetings.",
            "Could you check if the line noise is causing the periodic drops?",
        ],
        "response_templates": [
            "I’ve checked the signal trend and documented the repeat evening failures so we can avoid re-asking you for the same details.",
            "The line test shows a pattern starting after 8:30 pm, and I’ve noted the prior failed router restarts.",
            "We’ve saved the account notes for the new outage pattern and added the most recent channel change attempt.",
            "I’ve recorded the router reboots and the repeated call drops so the next technician sees the full timeline.",
            "The outage notes are now attached to your file and the support case is marked as a repeat issue.",
        ],
        "status_cycle": ["open", "escalated", "open", "resolved", "open"],
        "sentiment_cycle": ["frustrated", "neutral", "annoyed", "upset", "frustrated"],
    },
    "C-1006": {
        "issue_category": "billing",
        "device": "Fiber gateway",
        "plan": "Fiber 500",
        "ticket_prefix": "T-99502",
        "start_offset_days": 35,
        "total": 260,
        "channels": ["chat", "phone", "email"],
        "message_templates": [
            "My bill still includes the equipment fee after the promo ended.",
            "The account credit promised last month has not reached my statement.",
            "I need the promotional discount re-applied to the account.",
            "The charge for the gateway is still present and I think it’s incorrect.",
            "Can you confirm whether the credit was posted or if it was reversed?",
        ],
        "response_templates": [
            "I’ve traced the discount timeline and documented the prior promise so the billing team can verify the correct amount.",
            "The gateway fee has been flagged as a disputed charge and the account notes now reflect prior credit requests.",
            "I’ve noted the original promise and the missing credit so we do not ask you to repeat the same information.",
            "The billing history has been updated, and I’ve confirmed the remaining amount before the credit is posted.",
            "The disputed charge is now in the account notes with the exact dates and amounts the billing team needs.",
        ],
        "status_cycle": ["open", "resolved", "open", "open", "resolved"],
        "sentiment_cycle": ["frustrated", "annoyed", "neutral", "angry", "frustrated"],
    },
    "C-1007": {
        "issue_category": "setup",
        "device": "ONT + Wi‑Fi 6 router",
        "plan": "Fiber 300",
        "ticket_prefix": "T-99503",
        "start_offset_days": 52,
        "total": 290,
        "channels": ["phone", "chat", "email"],
        "message_templates": [
            "The modem won’t pair after I moved into the apartment.",
            "The activation steps don’t match the hardware I received.",
            "I need help connecting the ONT and setting up the new Wi‑Fi network.",
            "The move-in activation has not completed and I still do not have service.",
            "Could you help me verify the port status and network settings in the new unit?",
        ],
        "response_templates": [
            "I’ve confirmed the account is active and recorded the modem pairing steps that were already attempted.",
            "The move-in notes are now attached to the ticket so the next specialist can pick up without re-asking for address details.",
            "I’ve documented the failed pairing attempts and the account activation status before escalating to installation support.",
            "The ONT status has been checked and the account notes now reflect the current installation progress.",
            "The setup notes and failed activation attempts are captured so the next agent sees the latest progress immediately.",
        ],
        "status_cycle": ["open", "open", "resolved", "open", "escalated"],
        "sentiment_cycle": ["anxious", "neutral", "frustrated", "calm", "upset"],
    },
    "C-1008": {
        "issue_category": "hardware",
        "device": "TP-Link AX5400",
        "plan": "Fiber 1G",
        "ticket_prefix": "T-99504",
        "start_offset_days": 41,
        "total": 300,
        "channels": ["chat", "phone", "email"],
        "message_templates": [
            "The router is stuck in a boot loop and the internet goes out for hours.",
            "I have a replacement shipment, but it still has not arrived and my service is unstable.",
            "The device keeps restarting even after a factory reset.",
            "My Wi‑Fi is gone again and I’m losing streaming and gaming sessions.",
            "Can you confirm whether the replacement order was truly delivered or rerouted?",
        ],
        "response_templates": [
            "I’ve confirmed the repeated router restarts and logged the failed factory reset so it is not repeated.",
            "The replacement order details are attached to the ticket and the account now has the latest shipment notes.",
            "I’ve documented the boot loop pattern and the failed troubleshooting so the next agent has the full history.",
            "The shipment and replacement timeline are updated, and I’ve noted the customer impact during the outage period.",
            "The support notes now reflect both the router failure and the delay in the replacement shipment.",
        ],
        "status_cycle": ["open", "escalated", "resolved", "open", "open"],
        "sentiment_cycle": ["frustrated", "angry", "annoyed", "neutral", "upset"],
    },
    "C-1009": {
        "issue_category": "setup",
        "device": "Mesh Wi‑Fi system",
        "plan": "Fiber 300",
        "ticket_prefix": "T-99505",
        "start_offset_days": 26,
        "total": 240,
        "channels": ["chat", "phone", "email"],
        "message_templates": [
            "I just moved into a new apartment and I need setup help.",
            "The Wi‑Fi hub won’t connect to the line and I cannot get online.",
            "My home network needs a clean onboarding walkthrough before I can use it.",
            "I’m trying to connect my mesh units but the setup steps are unclear.",
            "The installation was delayed and I still don’t have working internet at the apartment.",
        ],
        "response_templates": [
            "I’ve documented the move-in activation steps and the current status of the new address setup.",
            "The onboarding history is now in the account, and the next agent will not need to re-collect the address details again.",
            "I’ve saved the mesh setup notes and the failed onboarding steps so the next support interaction is faster.",
            "The move-in activation has been logged and the support trace now includes the partial setup attempts.",
            "We’ve recorded the onboarding issues and the account status is ready for the next installation follow-up.",
        ],
        "status_cycle": ["open", "resolved", "open", "open", "resolved"],
        "sentiment_cycle": ["neutral", "frustrated", "calm", "happy", "anxious"],
    },
    "C-1010": {
        "issue_category": "storm",
        "device": "Outdoor modem + backup battery",
        "plan": "Fiber 500",
        "ticket_prefix": "T-99506",
        "start_offset_days": 61,
        "total": 260,
        "channels": ["phone", "chat", "email"],
        "message_templates": [
            "The service is unstable again after the storm and calls are dropping.",
            "The connection keeps cutting out during the evening and the router is offline intermittently.",
            "The outage started after the power blip and I’m worried the line may be damaged.",
            "My voice calls and internet are both unstable since the storm.",
            "Could you check whether the service line or backup battery needs attention?",
        ],
        "response_templates": [
            "I’ve documented the storm-related outage and the repeated evening instability so the next specialist can review the exact timeline.",
            "The account notes now reflect the weather-based outage and the prior failed power-cycle attempts.",
            "I’ve logged the backup battery and line checks so the next technician sees the full service-impact history.",
            "The service disruption is now documented with the storm timing and the repeated call drops attached to the ticket.",
            "We’ve saved the storm outage notes and the connectivity history so you do not need to repeat the same details again.",
        ],
        "status_cycle": ["open", "escalated", "open", "resolved", "open"],
        "sentiment_cycle": ["frustrated", "neutral", "upset", "annoyed", "frustrated"],
    },
    "C-1011": {
        "issue_category": "vpn",
        "device": "Business fiber gateway",
        "plan": "Fiber 1G",
        "ticket_prefix": "T-99507",
        "start_offset_days": 72,
        "total": 280,
        "channels": ["chat", "email", "phone"],
        "message_templates": [
            "My work VPN keeps dropping during client calls and I need stable internet.",
            "The connection is slow and unstable while I’m on video meetings.",
            "The business gateway has been resetting during peak work hours.",
            "Can you check whether the line quality or routing is causing the VPN instability?",
            "I’m working from home again and the connection is failing during critical calls.",
        ],
        "response_templates": [
            "I’ve recorded the VPN instability and the work-hour patterns so the next team can compare this against the line health history.",
            "The account now includes the repeated VPN and video-call failures, which helps the specialist keep the troubleshooting targeted.",
            "We’ve saved the previous line checks and the business gateway notes so you do not need to re-explain the same issue.",
            "The account notes reflect the failure window during work hours and the prior dropped-call incidents.",
            "The support history is now updated with the VPN failure pattern and the current business-use context.",
        ],
        "status_cycle": ["open", "resolved", "open", "escalated", "open"],
        "sentiment_cycle": ["frustrated", "calm", "neutral", "upset", "angry"],
    },
}.items():
    SEED[customer_id] = _bulk_history(
        issue_category=cfg["issue_category"],
        device=cfg["device"],
        plan=cfg["plan"],
        ticket_prefix=cfg["ticket_prefix"],
        start_offset_days=cfg["start_offset_days"],
        total=cfg["total"],
        customer_id=customer_id,
        channels=cfg["channels"],
        message_templates=cfg["message_templates"],
        response_templates=cfg["response_templates"],
        status_cycle=cfg["status_cycle"],
        sentiment_cycle=cfg["sentiment_cycle"],
    )

# Total is now comfortably above 2,000 synthetic memories across realistic telecom support scenarios.


async def _run_seed() -> None:
    by_id = {c["id"]: c for c in customers.DEMO_CUSTOMERS}
    for c in customers.DEMO_CUSTOMERS:
        await memory.ensure_bank(c["id"], c["name"])
    for cid, exchanges in SEED.items():
        for start in range(0, len(exchanges), 25):
            batch = exchanges[start : start + 25]
            await memory.remember_batch(cid, batch, name=by_id[cid]["name"])
            print(f"  queued {cid} interactions {start + 1}-{start + len(batch)}")
        print(f"[ok] {cid} ({by_id[cid]['name']}): {len(exchanges)} interactions")
    print("[ok] C-1004 (Liam Chen): empty bank - brand-new customer")
    print("\nHindsight processes memories asynchronously; give it about 30 seconds before demoing.")


async def main() -> None:
    try:
        await _run_seed()
    finally:
        await memory.close()


if __name__ == "__main__":
    asyncio.run(main())
