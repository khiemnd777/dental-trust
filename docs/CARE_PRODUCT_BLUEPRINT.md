# Patient Care product blueprint

## Product promise

Care helps a patient make a safe dental-care decision without needing to understand clinical or
operational terminology. Every screen should answer one of three questions: what is happening,
what do I need to do, and who can help me.

## Primary information architecture

1. **Today** — one prioritized next action, current journey, appointment and human support.
2. **Discover** — treatment-first clinic discovery, a location-aware Google map, transparent trust
   evidence, save and compare. Advanced markers and clusters keep patient ratings separate from
   explainable verification coverage; viewport padding preserves map context behind the details sheet,
   selecting a node reveals the evidence groups and verification date.
3. **Journey** — visual progress from request through aftercare, instructions and records.
4. **Messages** — secure case-based communication with the coordinator and clinic.
5. **Account** — identity, health profile, saved clinics, preferences, consent and privacy.

Secondary destinations such as notifications, clinic detail, consultation request, conversation
detail and dental passport are reached contextually instead of competing in the primary nav.

## Experience principles

- Mobile is the default canvas; desktop adds breathing room, never more complexity.
- One primary action per surface. Destructive or legally meaningful actions need confirmation.
- Use patient language and reveal clinical detail progressively.
- Trust claims always link to evidence, scope and verification date.
- Price is an estimate until a clinician reviews the patient's records.
- Empty, loading, error and offline-tolerant states are part of the product, not afterthoughts.
- Touch targets are at least 44px; text remains legible at 200% zoom; motion respects user settings.

## Core lifecycle

Discover → request guidance → complete health information → receive options → compare → consult →
book → prepare → receive treatment → recover → access dental passport and aftercare.

The Care frontend owns its shell and patient language. It consumes shared backend contracts but
must not import Provider or Operations application components.
