# Newt Creative Workflow Study: Dreamers

## Source And Scope

- Source: [Dreamers AI Short Film - NewtNode Tutorial - Full Cinematic Breakdown](https://www.youtube.com/watch?v=Ks2letse6Mg), by Steven Weinzierl, approximately 47 minutes.
- Study date: 2026-09-13. Read the complete available YouTube transcript (361 timestamped segments, 00:00 through 47:06). Visually inspected selected screens around 19:50, 28:05, 41:47 and 45:16.
- This is a transcript-led workflow study with sampled visuals, not a continuous audiovisual review or an independent assessment of lip sync, sound, motion or every frame. Automatic captions contain transcription errors. The separately linked finished short film was not reviewed.
- This document records observed practice and proposed agent behavior. It does not change Newt's runtime, train a model, or enable automatic retrieval. Future implementation must explicitly load applicable guidance and evaluate its effects.
- Tutorial-era node names, sheet designs, model choices and compatibility demonstrations are historical evidence, not current API contracts. Current code and `node-standards.md` remain authoritative.

## Central Lesson

The workflow is asset-first and decision-led, not simply a sequence of generation calls. Steven develops alternatives, selects a coherent cast/location/look, prepares reusable references, writes explicit physical and performance beats, then uses Director to structure the scene. A technically successful video still receives an editorial review.

Newt should learn the reasons for these decisions rather than replaying all clicks or applying this particular film's look to every project.

## Observed Workflow

### 1. Develop Identity Before The Scene

At [01:51-05:54](https://www.youtube.com/watch?v=Ks2letse6Mg&t=111s), Steven starts Emma with a simple portrait description. Distinctive features and personality cues are intended to avoid generic, overly polished AI faces. A neutral gray background makes the person easy to assess.

Text supplies subject-specific facts; Camera and Style supply their own production guidance. The demonstrated portrait uses CU, 50mm, Portrait, Cinematic Standard and no Grade. Four 3:4, 2K alternatives are generated. Nano Banana is chosen for demonstration speed, not stated as a universal quality winner.

At [12:00-12:57](https://www.youtube.com/watch?v=Ks2letse6Mg&t=720s), he compares candidates at larger size. He says normal production would involve more exploration and targeted changes before committing to a character. Start simply and refine based on what the image actually needs.

### 2. Build Separate References For Each Role

At [06:10-07:30](https://www.youtube.com/watch?v=Ks2letse6Mg&t=370s), the rat receives its own neutral-background reference generation. At [16:10-17:14](https://www.youtube.com/watch?v=Ks2letse6Mg&t=970s), the same configured generation branch is reused to develop the book with a short, literal description that requests a physical object, not cover art.

At [18:23-20:54](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1103s), acceptable-looking book candidates are not automatically accepted: he runs another batch because none is a strong enough choice, then selects one and crops excess background. Chosen assets become clearly named reusable nodes.

The rat is a narrative performer but is connected through the Director's Props input in this demonstration. Do not turn that port choice into a rule that all animal actors are props. Semantic role, available node capabilities and the user's intent are distinct concerns.

### 3. Establish Location And Look Deliberately

At [07:37-11:56](https://www.youtube.com/watch?v=Ks2letse6Mg&t=457s), the apartment is generated as a clean location plate without people or pets. A three-quarter view reveals room depth and usable spatial information. The prompt includes scene-relevant furniture, windows and modest atmosphere.

The demonstrated controls are WS, 35mm, Cinematic Indie, Moody Meadow Grade and a 21:9 output. The wider ratio is chosen with the intended film frame in mind. He describes 2K as sufficient for the demonstration and says he would normally consider 4K for client work.

Custom Grade is demonstrated with an image from earlier work as a color reference. Treat grade as a separate color/look concern, not permission to copy that image's subject, location or composition. The tutorial describes intended palette transfer; it is not proof of exact colorimetric reproduction by a generative model.

### 4. Prepare Character And Wardrobe References

At [13:05-15:25](https://www.youtube.com/watch?v=Ks2letse6Mg&t=785s), the selected portrait enters Character, receives a name and two wardrobe references, and has Cinematic and CU Video Generation enabled before sheet generation.

At [27:55-30:17](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1675s), Steven reviews the generated sheets, explains why identity/layout continuity matters, and chooses the outfit for the scene. The open-mouth reference has a deliberate role in helping speech appearance. Video uses the appropriate CU variant of the selected wardrobe.

Current implementation constraints still apply: internal base sheets must not be forwarded as production wardrobe references. A base selected for inspection is not automatically the intended final costume.

### 5. Curate Mood References, Do Not Accumulate Everything

At [18:56-20:15](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1136s), Steven distinguishes look references from subject references. The rat is not useful as a mood-board image. He also notices that two proposed look references do not agree and settles on one coherent frame.

This is an important agent requirement: a mood board is not a collage of every available asset. One appropriate look reference can be better than several conflicting ones. Approve the overall mood before progressing to expensive scene generation.

### 6. Assemble Director Only After Asset Preparation

Independent asset preparation overlaps in time while longer character-sheet generations run. At [20:58-26:13](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1258s), selected assets are grouped and connected by role. Short notes clarify that the rat is an apartment pet and the book belongs to Emma.

The example uses a 30-second scene, 720p, 21:9 and Auto shot count. These are contextual choices, not permanent defaults. At [30:07](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1807s), Steven explicitly recommends finishing, connecting and labeling the assets before locking Setup.

Style is informed by the mood board and the other relevant assets. Camera remains independently editable. In this example he accepts restrained handheld coverage, natural eyelines and subtle emotional push-ins, but explicitly gives static frames, dollies and tracking as alternatives.

### 7. Write Observable Action And Performance Beats

The main teaching section is [31:57-37:21](https://www.youtube.com/watch?v=Ks2letse6Mg&t=1917s). Keep the overview concise but specify consequential intermediate actions:

1. Emma lounges with a book, rather than sitting alert at the sofa's edge.
2. Movement catches her attention; she lowers the book and looks down.
3. The rat crosses the floor in a defined screen direction.
4. It climbs the sofa, then her nearer arm, then settles on her shoulder.
5. Her reaction is delight, not fear.
6. Each dialogue line has an explicit speaker and relevant vocal direction.
7. Laughter changes to mock seriousness, followed by a deliberate shared eyeline and pause.

The point is causality and readable performance. Omitting the route to the shoulder invites invented motion, extra shots or apparent teleportation. Tone and reactions make the action mean something. Do not solve this by mechanically expanding every trivial movement or duplicating camera/style prose inside the overview.

### 8. Build, Then Revise The Intended Outcome

At [37:21-42:48](https://www.youtube.com/watch?v=Ks2letse6Mg&t=2241s), Director creates a shot list, then assembles scene rules, style, camera direction, continuity and asset tags into the final prompt.

Steven reviews four proposed shots, requests an additional final wide shot in ordinary language, and checks the revision against the original. The revision is expected to redistribute pacing within the scene, not append material while leaving all prior timings untouched. Assets remain reusable for later scenes.

The screen sampled at 41:47 shows the original four-shot prompt during this comparison; the transcript explains the subsequent revised version. The one sampled screen alone is not evidence of all revised timings.

### 9. Verify The Video Handoff And Review The Result

At [42:56-44:45](https://www.youtube.com/watch?v=Ks2letse6Mg&t=2576s), Steven checks that Director settings and references reach Video Model. The example switches to a model supporting the intended 30 seconds before submitting. The exact historical fallback behavior shown should not become permission for Newt to silently change a user's model or shorten a scene.

At [44:52-46:52](https://www.youtube.com/watch?v=Ks2letse6Mg&t=2692s), he inspects the first result, connects Preview and separates successful generation from editorial quality. Although the scene broadly works, he considers 30 seconds too long for its content and suggests revising to 20 seconds, cutting sooner or adding meaningful dialogue. The tutorial does not show that suggested 20-second rerender.

## Things Newt Must Not Learn Literally

- Do not delete creation branches just because Steven removes them on screen. At [15:33-15:41](https://www.youtube.com/watch?v=Ks2letse6Mg&t=933s), he explicitly says this is for demonstration clarity and not his usual practice.
- Do not always generate four images, choose 720p/2K or use 30 seconds. These are examples with speed/cost constraints. Batch size and resolution must fit the brief, budget and existing user choices.
- Do not force Moody Meadow, Cinematic Indie, gray backgrounds or a particular lens onto unrelated commercial, animation or other work. Some choices are look-specific; neutral identity preparation serves a different purpose from the final scene's grade.
- Do not keep generating indefinitely because a result is not ideal. Candidate selection and retries need explicit budgets, limits and a reason for each retry.
- Do not promote the tutorial's one successful first video run to a reliability guarantee.
- Do not infer that a downloaded transcript or a Markdown file automatically changes the Newt node's behavior.

## Proposed Newt Improvements

These are implementation proposals inferred from the tutorial, not features implemented by this study. First audit existing Newt planning, reference handling, inspection, reuse and budget logic to avoid duplicating it.

| Capability | Intended behavior | Evaluation |
| --- | --- | --- |
| Applicable creative workflow | Recognize a cinematic narrative brief and plan reusable subjects, location, look, necessary props, Director and output, rather than jumping straight to Video. | A new narrative request produces the relevant preparation stages without inventing unnecessary props or forcing an unrelated look. |
| Candidate selection | Compare actual images for brief fit, distinctiveness, useful framing, identity and artifacts; persist the chosen source and concise reasons. | Does not always choose candidate one or claim inspection of an unseen image. |
| Typed reference manifest | Track role, chosen source, intended wardrobe, readiness and source revision. Keep look references distinct from literal content. | Only the scene's needed, ready references reach the paid request; no internal bases or rejected candidates. |
| Look consistency | Establish one coherent visual direction, preserve neutral identity references where appropriate, and apply the look at the correct stage. | Conflicting mood references are resolved rather than indiscriminately combined. |
| Causal beat planning | Turn a brief into concise observable actions, transitions, eyelines, speaker turns and reactions. | No skipped physical transition or ambiguous dialogue attribution; no unrelated poetic padding. |
| Revision propagation | Update genuinely affected sections and the final prompt while reusing unchanged assets and work. | Adding a final wide shot updates shot count/pacing; changing duration or wardrobe does not regenerate unrelated assets. |
| Editorial completion | Check deliverables and, with appropriate evidence, creative criteria such as pacing and reference fidelity. | Reports uncertainty about sound/lip sync or motion when only still samples were inspected; never marks a weak result approved merely because an MP4 exists. |
| Economical orchestration | Use deterministic code for graph construction, naming, grouping, wiring, capability checks and saved recipes; reserve LLM/vision work for actual judgment. | No extra model call to rename/group/wire; unchanged inspected assets reuse valid evidence; retries remain bounded. |

The agent's existing Auto Review option should govern user interruptions. Internal checks can run without another approval dialog where the user's permissions allow it; they must not bypass budget limits, protected nodes, paid-request recovery or provider uncertainty.

Keep Steven's preferences in an explicitly scoped creative profile or reusable skill, not a universal rule imposed on every coworker. Existing preset choices and explicit user instructions take priority. Tutorial-derived guidance should be versioned and source-linked, with application loading and regression tests added deliberately.

## A Useful First Evaluation Brief

Use the previously discussed dog-in-the-park request as a held-out task, not a verbatim copy of this film. Expected behavior: understand the desired narrative/look, inspect reusable inputs, develop missing subject and location references, select appropriate results, prepare Director and verify the video handoff. Do not automatically copy Emma's wardrobe workflow, the apartment palette, the talking-animal dialogue or a fixed number of generations.

Evaluate one workflow at a time with mocked graph/budget checks first. A paid creative evaluation should have an explicit run budget and compare Newt's choices against Steven's assessment. Record where the system follows the graph correctly but still misses the intended creative standard.

## Most Valuable Companion Materials

- The saved NewtNode workflow package for this demonstration, including reference assets, chosen outputs and revision history. A portable package is stronger evidence of exact settings and connections than reading them from video pixels.
- A few accepted versus rejected image/video examples, with short reasons for each decision.
- A future tutorial that shows an unsuccessful result and the exact corrective revision, especially what should remain unchanged.
- A contrasting production example, such as polished commercial work or animation, to distinguish stable working methods from this film's particular style.

## Initial Runtime Implementation

The follow-up implementation adds three scoped, versioned creative skills, an Advanced settings editor, and preset-first AI planning with actual library inspection and revision checks. See [Newt Creative Skills](newt-creative-skills.md) for use, maintenance and evaluation. Tasks capture the skill version they start with; local edits apply to later tasks. This is explicit guidance, not automatic model training.

The capability table above remains an evaluation roadmap, not a claim that every proposed capability is complete. Existing inspection, reference, revision and budget tools still define what Newt can execute. No paid creative evaluation of the tutorial-derived guidance has been run.
