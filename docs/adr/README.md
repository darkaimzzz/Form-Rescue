# Architecture decision records

| ADR                                              | Decision                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| [0001](0001-stack-and-build.md)                  | Stack, tooling versions and build shape                                     |
| [0002](0002-storage-idb-and-fingerprints.md)     | IndexedDB via `idb`, keyed fingerprints, strict durability                  |
| [0003](0003-permissions-and-browser-minimums.md) | Permission model, origin policy, browser minimums, Firefox data declaration |
| [0004](0004-matching-thresholds.md)              | Conservative matching baseline and field identity                           |
| [0005](0005-testing-real-extension.md)           | Real-extension testing strategy                                             |
| [0006](0006-classifier-scope.md)                 | Sensitive-field classifier scope and value screening                        |

Template: context → decision → alternatives → consequences. Any change to permissions, thresholds, retention or the data model needs a new ADR.
