# Schema Evolution Patterns

Common changes that anchors handle gracefully:
- Column renames (email → email_address)
- Reordering and insertion of columns
- Type coercions (int → bigint, string timestamps)
- Splits/merges (first/last name ↔ full_name)

Recommended practices:
- Use anchors as stable identifiers in joins
- Monitor drift and confidence changes over time
- Validate downstream models after large changes

