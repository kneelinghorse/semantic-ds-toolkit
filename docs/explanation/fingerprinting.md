# Fingerprinting Algorithm

Fingerprints summarize a column using:
- Statistical metrics (min/max/nulls/uniqueness)
- Pattern matches (emails, phones, currency, timestamps)
- Type inference (string, numeric, date, etc.)

Design goals:
- Deterministic on the same data
- Robust to ordering and sampling variance
- Efficient on large datasets via sampling

Confidence is derived from signal strength and agreement across detectors.

