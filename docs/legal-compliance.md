# Legal compliance (India only): what the site covers, and what still needs you

Written 18 October 2026. **Not legal advice.** No terms or policy can stop someone from suing; what they do is make claims much harder to win and show regulators you meet your duties. Have a lawyer in India review the final text before launch.

**Paire is India-only (owner, 2026-10-18).** The Terms say Paire is only for people living in and using it from India, and every page follows Indian law only. If Paire ever opens to other countries, their laws (UK/EU GDPR and cookie consent, US state privacy and dating-safety laws, the US DMCA, Canada's PIPEDA) need adding back first; commit `d37d48f` has a draft.

## Pages

| Page | Covers |
|---|---|
| `/terms/` | India only; eligibility (18+, no sex/violent offenders, banned members), IT Rules 2021 list of prohibited content, content licence, Plus/Unlimited Chat payments, copyright, **no criminal background checks** (bold), automated moderation, complaints and appeals (24 h acknowledgement, 15-day resolution, 24 h for intimate images and impersonation), disclaimers, liability cap (Consumer Protection Act rights preserved), indemnity, Indian law and [CITY] courts, severability, entire agreement, notices |
| `/privacy/` | Data collected, AI and chat safety, support access, providers, **cookies table** (Meta Pixel only with consent), **rights under the DPDP Act 2023** (summary, correction, erasure, withdrawal, nomination, Grievance Officer, Data Protection Board), data processed abroad by providers, **facial data retention** (selfie and templates destroyed within 24 h), retention, breach notification (Data Protection Board, CERT-In), children, Grievance Officer |
| `/privacy-choices/` | Turn the Meta Pixel on or off; Meta cookies deleted on opt-out |
| `/copyright/` | Copyright notices and counter-notices under the Copyright Act 1957 and IT Rules; impersonation and intimate images within 24 h |
| `/accessibility/` | WCAG 2.1 AA aim and how to report a barrier |
| `/safety/` | **No background check** notice; India emergency (112), women's helpline (181), cyber fraud (1930) |
| `/refunds/` | Cancellation and refunds; Consumer Protection Act remedies preserved |

**Meta Pixel:** loads only after a visitor taps **Allow** in a small banner (or on `/privacy-choices/`), as the DPDP Act bases processing on consent. Before this, it loaded for everyone and the Privacy Policy wrongly said "we use no cookies".

**Claims fixed:** "every member is selfie-verified" (About, city pages, Tinder comparison) was untrue while verification is optional; now "every member confirms their email; verified members carry a blue badge".

## Needs you (the pages can't do these)

1. **Fill in the business details** in Vercel (`PAIRE_SUPPORT_EMAIL`, `PAIRE_GRIEVANCE_EMAIL`, `PAIRE_POSTAL_ADDRESS`, `PAIRE_JURISDICTION_CITY`, `PAIRE_LEGAL_EFFECTIVE_DATE`). Until all are set, every legal page shows the "Private preview · Legal draft" banner. India's E-Commerce Rules and IT Rules require a real name, address, grievance officer and contact.
2. **Lawyer review** of all legal pages (India first).
3. **Consider a company** (private limited or LLP) instead of operating as an individual: today the Terms are an agreement with Hritik Chaudhary personally, so personal assets are exposed. Update the operator name in the pages afterwards.
4. **GST registration** once required, and tax on digital services sold abroad.
5. **Keep it India-only:** don't advertise outside India. For a hard block, Vercel's firewall can block other countries (Project → Firewall → custom rule on country); payments are charged in rupees only.
6. **Data processing agreements** with Google (Firebase, Vertex AI), Anthropic, Resend, CCAvenue and Meta (accept them in each provider's console).
7. **Insurance:** cyber liability and professional/general liability once members grow.
8. **Keep it true:** whenever a feature changes (payments, AI, verification), update the Privacy Policy and Terms in the same release.
