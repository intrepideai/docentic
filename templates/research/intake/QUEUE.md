# Research Intake Queue

> **State machine for research items.** Scouts append to `## Pending`; researcher moves items through `## Processing` → `## Processed`; librarian trims old `## Processed` into `## Archive`.

## Pending

_No items yet. Scouts will populate this section on their first run._

## Processing

_Items currently being researched._

## Processed

_Completed items. Trimmed to last 7 days by librarian; older entries move to Archive._

## Archive

_Older processed entries, kept for permanent dedup but no longer surfaced in views._
