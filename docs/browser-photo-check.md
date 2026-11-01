# Browser photo comparison — 2 November 2026

The owner requested camera/profile comparison on the member's device to avoid paid model calls. The web Verification screen now offers a private device check, independent of the server's verified badge.

## Member flow

The member explicitly agrees to local facial-data processing and starts the check. Only then does the browser download the checker (about 50 MB on the first use, cacheable), open the camera and compare a captured selfie against the member's current profile photos. Models are not downloaded on screen mount. The first profile photo must contain one clear face; later group photos may contain the member and others. Missing/unclear/mismatched faces produce retry or photo-edit guidance.

Inference runs in a module Web Worker with single-threaded ONNX Runtime Web 1.22.0, YuNet and SFace. Camera pixels and face vectors are not sent to an API, saved, logged or added to analytics. The only comparison-related network operations are static checker downloads and GETs for the member's own existing profile photos. Profile image requests omit credentials/referrers and can use the browser cache. There are no Firebase callable or document writes from the device checker and no paid-provider fallback.

Completion, cancellation, navigation away, hidden tabs, changed profile photos, account changes and unmount terminate the worker/cancel outstanding photo downloads. Camera unmount stops every media track. Transient image buffers are cleared where accessible and face vectors never leave the worker. Results stay in screen memory and clear when the member leaves or changes photos. Decode/load/runtime failures offer actionable retry guidance without displaying runtime internals. Unsupported browsers cannot start the check.

## Trust boundary

The result is labeled **Photos match on this device**, never a verified badge. Browser logic/results can be modified by the member; this comparison cannot establish liveness, block replay/deepfakes or prove account ownership. No `moderation.verification` record, expiry or access gate is changed. Existing server approvals retain their original photo binding and expiry. New server Gemini checks remain paused when the separate paid-AI switch is off. This implements the requested local comparison, not a replacement trusted server approval or a new manual review submission workflow. Native verification is unchanged.

## Static assets and costs

`apps/web/scripts/face-check-assets.mjs` prepares public files under `/face-check/v1/`. OpenCV weights come from commit `48b10fa505aeb51fbd127fc60a5c660040e823b7`, validated against the same SHA-256 pins as the existing server matcher. Both hashes are rechecked by the browser before inference. Build download caches are ignored by Git; large models are not committed. Runtime files come from the exact npm version and lockfile, and model/runtime licenses and redistribution notices ship with the assets. Versioned model/runtime URLs receive long cache lifetimes; worker/math files revalidate. Upgrade the asset version before changing pinned runtime/weights.

There is no per-check Model Garden inference charge for this device flow. Static website bandwidth and profile-photo downloads still consume hosting/storage traffic; zero total Firebase/hosting spend is not promised. The earlier [paid-AI cost controls](firebase-cost-controls.md) still need backend deployment to stop production bios/openers/matching/safety/Gemini verification requests.

## Verification and release status

- App lint/typecheck and 285 tests passed in the full verification run. Three additional service tests passed after final error-message handling changes (288 unique app tests total). Functions lint/typecheck/build and 385 tests, 31 website tests and five script tests passed. Standard emulator ports were occupied, so isolated demo-muse emulators passed 155 rule tests and all 254 integration tests in 20 suites.
- The final production web build includes all static runtime/weights/licenses. No local QA entry or fictional-account hook is included in the production bundle.
- Real browser/ONNX inference passed same-person, different-person, no-face, multiple-selfie-face and first-profile-group-photo cases using public OpenCV sample images. A corrupted model was rejected before inference without returning a match. Requests were local GETs only and worker messages returned no vectors/scores/images.
- A temporary local harness using the actual web component/controller/camera and models passed 390/1280px acceptance: explicit consent, successful comparison, stopped camera on completion/cancel, cleared results, no document overflow, no page errors, no external requests and no POSTs/writes. It used a fictional in-memory profile and a synthetic camera stream from public sample imagery. The harness was removed and its Metro process stopped. Screenshots/logs remain under `/tmp/paire-device-*` for review. Camera permissions/compatibility on physical devices and other browser engines have not been tested.

Local changes only: not pushed or deployed. No production customer account, payment, verification record, runtime switch or cloud API configuration was changed. Publish the browser after the owner requests deployment; deploy the earlier paid-AI backend guard as part of the cost-saving rollout.

Sources: [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/), [runtime flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html), [pinned OpenCV Zoo models](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models).
