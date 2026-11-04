# Data validation report

This report describes the privacy-safe aggregate used by the Global Research Atlas.
It does not contain personal information or submission text.

## Eligibility

Each row in the supplied extract is counted once as an abstract submission. The extract has no session identifier, submission form, status or title, so duplicate identifiers, bursary applications and test titles cannot be detected. Counts describe submissions in this extract. They do not describe accepted research.

The public label is **abstract submissions**. Nothing in the source marks a record as accepted.

## Reconciliation

- Eligible submissions: **2143**
- Sum of scientific-stream totals: **2143**
- Countries represented: **114**
- Submissions with a matched country: **2131**
- Blank country: **11**
- Unmatched country submissions: **1**
- Geographic + blank + unmatched: **2143**

These three views of the same extract reconcile to the eligible total.

## Leading figures

- Leading country: Canada (192)
- Leading scientific stream: Clinical obstetrics (709)

## Scientific streams

| Stream | Submissions | Countries | Leading country |
|---|---:|---:|---|
| Maternal fetal medicine | 352 | 62 | Mexico (35) |
| Clinical obstetrics | 709 | 81 | Canada (67) |
| Gynaecology | 196 | 54 | Canada (19) |
| Sexual and reproductive health and rights | 403 | 61 | United States (48) |
| Reproductive medicine | 125 | 41 | Canada (17) |
| Women's cancer | 232 | 62 | India (18) |
| Endocrinology | 126 | 37 | Canada (17) |

## Unmatched and blank country values

Blank countries remain in the submission total and are excluded from the map and from the country count.

Unmatched labels, with submission counts:

- `[object Object]`: 1

## Tie-breaking

Higher counts rank first. Equal counts are ordered by country or stream name from A to Z using British English case-insensitive alphabetical order, then by code. Tied countries share a competition rank, and the Top 10 list keeps every country tied with the final included place.

## Geographic notes

Country boundaries are Natural Earth admin-0, public domain, at 1:110m, with 1:50m shapes added only for Singapore and Hong Kong SAR because they are omitted from the 1:110m countries file. The map does not assert a political position. Taiwan, Palestine, Kosovo, Northern Cyprus, Somaliland and Western Sahara appear as published by Natural Earth and should be reviewed by FIGO.

Alias entries in the mapping table: 141.

## Source limits

- Session identifiers available: False
- Submission form available: False
- Status available: False
- Title available: False

Because those fields are absent, the pipeline cannot remove test titles or bursary applications, and it cannot deduplicate on `session_id`. Repeated country and stream combinations are separate submissions, not duplicate identifiers.
