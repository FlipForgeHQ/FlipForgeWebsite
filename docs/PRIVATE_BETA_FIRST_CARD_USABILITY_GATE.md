# FlipForge Private Beta — First-Card Usability Gate

## Purpose

This gate answers one question: can a first-time invited tester evaluate one real card from start to finish without outside coaching?

The tester should receive only this instruction:

> Use FlipForge to evaluate one card.

Do not explain navigation, terminology, Discover, Evaluate, Saved Decisions, Tracking, Forge Heat, Evidence, PSA Advisor, or any other workflow before the test.

## Required customer path

1. Activate the invited account.
2. Follow the first-run welcome experience.
3. Start a new card.
4. Enter one exact card identity.
5. Resolve or confirm the exact card when needed.
6. Search connected sources.
7. Choose the intended active listing.
8. Evaluate the listing.
9. See a clear saved confirmation.
10. Read the plain-English BUY / WATCH / VERIFY / PASS summary.
11. Understand why the decision was reached.
12. Track the card or start another card.

## Pass criteria

The usability gate passes only when the tester can complete the path without asking another person:

- where to enter a card;
- what the returned marketplace cards are;
- which listing to select;
- how to evaluate it;
- whether the evaluation was saved;
- what BUY / WATCH / VERIFY / PASS means;
- what to do after the decision;
- how to start another card;
- where advanced tools belong in the workflow.

The interface must recover helpfully from no exact identity, no listing, and evaluation failure states. A failure state must explain what happened, confirm whether anything was saved, and provide a next action.

## Failure rule

Any moment where the tester stops and asks “what do I do now?” is a product usability defect to record. Do not coach around it during the test and then mark the path as passed.

Severity guidance:

- **Blocker:** cannot begin a card, cannot evaluate, loses a saved decision, sees another account's data, or cannot recover from a normal failure state.
- **Near-blocker:** the correct next action exists but is difficult to find or understand.
- **Polish:** the tester succeeds without coaching but wording, spacing, hierarchy, or emphasis can be improved.

## Guided Mode acceptance

Guided Mode should behave like an experienced FlipForge user sitting beside the tester. On every core step it should make four things clear:

1. Where am I?
2. What am I looking at?
3. Why does it matter?
4. What should I do next?

The core path is:

**Discover → Evaluate → Understand → Track**

Advanced Intelligence should remain available but visually secondary until the first-card path is complete.

## Release decision

Do not open the private beta to additional outside testers until one clean first-time-user run completes this gate without outside coaching and without a Severity 1 / Blocker issue.
