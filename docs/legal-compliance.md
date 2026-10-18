# Legal compliance: what the site covers, and what still needs you

Written 18 October 2026. **Not legal advice.** No terms or policy can stop someone from suing; what they do is make claims much harder to win and show regulators you meet your duties. Have a lawyer in India review the final text before launch, and a UK/US/Canadian lawyer before you market Paire in those countries.

## Pages

| Page | Covers |
|---|---|
| `/terms/` | Eligibility (18+, no sex/violent offenders, banned members), India-first availability, IT Rules 2021 list of prohibited content, content licence, Plus/Unlimited Chat payments, copyright, **no criminal background checks** (bold), automated moderation, reports, complaints and appeals (24 h acknowledgement, 15-day resolution, 24 h for intimate images and impersonation), "as is" disclaimers, liability cap with non-excludable rights preserved, indemnity, Indian law with consumers' local mandatory rights preserved, severability, entire agreement, no waiver, transfer, force majeure, electronic notices |
| `/privacy/` | Data collected, AI and chat safety, support access, sharing and providers, **cookies table** (Meta Pixel only with consent), rights by region (**India DPDP + Data Protection Board; UK/EU legal bases, rights, ICO; US state rights incl. California, no sale, sharing opt-out, GPC, sensitive data, appeals; Canada PIPEDA/Quebec + OPC**), international transfers, **facial data retention and destruction schedule** (Illinois BIPA, Texas, Washington), retention, security and breach notification, children, Grievance Officer |
| `/privacy-choices/` | "Do Not Sell or Share" equivalent: turn advertising measurement on/off, GPC honoured, Meta cookies deleted on opt-out |
| `/copyright/` | Notice-and-takedown for India and the US DMCA (notice elements, counter-notice, repeat infringers), impersonation and intimate images within 24 h |
| `/accessibility/` | WCAG 2.1 AA commitment, known limits, how to report a barrier (US ADA demand letters usually target sites without one) |
| `/safety/` | Conspicuous **no background check** notice (required by US online dating safety laws such as New Jersey's, New York's, Illinois' and Texas'), emergency and fraud numbers for India, US, UK, Canada, EU |
| `/refunds/` | Adds the UK/EU 14-day right to cancel (full refund) and preserves local consumer remedies |

**Meta Pixel:** loads only after a visitor taps **Allow** in a small banner (or on `/privacy-choices/`). "No thanks", no answer, or a Global Privacy Control signal means no Meta code or cookie at all. Before this, the pixel loaded for everyone without asking, which UK/EU cookie law forbids, and the Privacy Policy wrongly said "we use no cookies".

**Claims fixed:** "every member is selfie-verified" (About, city pages, Tinder comparison) was untrue while verification is optional; now "every member confirms their email; verified members carry a blue badge".

## Needs you (the pages can't do these)

1. **Fill in the business details** in Vercel (`PAIRE_SUPPORT_EMAIL`, `PAIRE_GRIEVANCE_EMAIL`, `PAIRE_POSTAL_ADDRESS`, `PAIRE_JURISDICTION_CITY`, `PAIRE_LEGAL_EFFECTIVE_DATE`). Until all are set, every legal page shows the "Private preview · Legal draft" banner. India's E-Commerce Rules and IT Rules require a real name, address, grievance officer and contact.
2. **Lawyer review** of all legal pages (India first).
3. **Consider a company** (private limited or LLP) instead of operating as an individual: today the Terms are an agreement with Hritik Chaudhary personally, so personal assets are exposed. Update the operator name in the pages afterwards.
4. **GST registration** once required, and tax on digital services sold abroad.
5. **Selling outside India:** the simplest protection is not to target other countries. If you do market in them:
   - **UK/EU:** appoint a UK representative and an EU representative (UK GDPR / GDPR Article 27); do the UK Online Safety Act illegal-content risk assessment and children's access assessment; get express consent plus acknowledgement at checkout if you want to keep refusing 14-day cancellations.
   - **US:** register a DMCA designated agent with the US Copyright Office (copyright.gov/dmca-directory, US$6) or the DMCA safe harbour doesn't apply; review state dating-safety laws for each state you target.
   - **Canada:** CASL consent before any marketing email; Quebec Law 25 privacy impact assessment for transfers.
6. **Data processing agreements** with Google (Firebase, Vertex AI), Anthropic, Resend, CCAvenue and Meta (accept them in each provider's console).
7. **Insurance:** cyber liability and professional/general liability once members grow.
8. **Keep it true:** whenever a feature changes (payments, AI, verification), update the Privacy Policy and Terms in the same release.
