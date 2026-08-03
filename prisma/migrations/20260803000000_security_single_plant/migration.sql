-- Security Officer role must always have exactly one assigned plant/location —
-- their existing single "defaultLocation" field remains that one location.
-- This removes any additional plant mappings a Security Officer user may already
-- have accumulated (e.g. from before this restriction existed, or from a prior
-- role that supported multiple plants). Purely corrective data cleanup — no
-- schema change, no effect on any other role's mappings.
DELETE FROM "UserPlantMapping" upm
USING "User" u
WHERE upm."userId" = u.id AND u.role = 'SECURITY_OFFICER';
