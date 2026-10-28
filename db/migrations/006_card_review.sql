-- A person's verdict on a card in review (lib/review.ts) and the feedback that
-- came with it live in the card's metadata, like the other optional task fields.
-- Each verdict is also a comment, so card_comments keeps the history.
ALTER TABLE cards ADD CONSTRAINT cards_review_check CHECK (
  coalesce(metadata->>'reviewStatus', 'approved') IN ('approved', 'changes_requested')
  AND coalesce(jsonb_typeof(metadata->'reviewFeedback'), 'null') IN ('null', 'string')
  AND length(coalesce(metadata->>'reviewFeedback', '')) <= 10000
);
