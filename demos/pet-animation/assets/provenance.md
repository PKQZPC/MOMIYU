# Artwork provenance

## body-poses.png

Generated using the built-in image_gen tool from the project's reference atlas.
Source: `D:/codex/codex/generated_images/01a16781-00d8-7e71-80c7-39fb92a5dc39/exec-0e1c863b-05f1-4032-8d84-5e77a2c02caf.png`.
The unmodified transparent image is a 3 by 2 sheet of six body poses. Runtime
cropping and measured row baselines keep the character grounded. This is a
key-pose animation example, not a skeletal rig or automatic production pipeline.

Generation prompt:

> Create a SINGLE runtime character POSE SPRITESHEET as an identity-preserving edit derived from the reference. Reference target is ONLY the IVORY/LAVENDER BABY in TOP ROW SECOND CELL, not grown forms, not green row. Preserve exact baby face, small cream body, floppy lavender-tipped ears, big dark brown eyes, golden diamond forehead mark, short lavender-tipped curled tail, tiny paws, same soft matte 3D illustrative style. Output landscape 3:2 aspect ratio, EXACT 3 columns x 2 rows of SIX equal square cells on TRUE TRANSPARENT BACKGROUND. No labels, no grid lines, no text. Every full-body sprite stays inside its own cell with 12% clear padding, feet baseline at 82% of cell height, body scale identical across all six cells, same camera at front three-quarter facing slightly left. This is real BODY ANIMATION, NOT six copies of the same idle pose: actual paws, ears, head, eyelids and torso must change. Top row cell 1: neutral sitting, both front paws resting on ground. Top row cell 2: lift the front paw on viewer LEFT up beside cheek, bend elbow, look toward viewer with both eyes open; other paw remains grounded. Top row cell 3: SAME raised paw extends outward in a clear wave, paw pads visible, ears slightly lifted. Bottom row cell 1: waving paw bends inward beside face, eyes gently CLOSED, small happy smile. Bottom row cell 2: both paws grounded, head turned and tilted toward viewer RIGHT looking curiously sideways, one floppy ear lifted and the other hanging, clear head/ear articulation while torso stays stable. Bottom row cell 3: a full-body playful stretch: front paws reach forward along ground, chest lowers, back arches, eyes closed, ears fall forward, tail curves upward. All six are the SAME character, consistent proportions and design, no clothing or accessories, no detached effects, no stars or sparkles, no background or ground shadows. Keep grounded body anchor stable. Do not crop ears, tail or waving paw. Crisp transparent alpha.

This local demo uses AI-generated reference art, not a selected production
character or a working per-user evolution pipeline. Generation used the
built-in image_gen tool, not the CLI/API fallback. No API key is required.

## reference-atlas.png

Source: `D:/codex/codex/generated_images/01a16781-00d8-7e71-80c7-39fb92a5dc39/exec-54c275ee-4787-435e-871d-df3a2ce929ef.png`.

The reference sheet was generated during the earlier exploratory discussion.
This demo reads only the ivory/lavender hatchling in the top row's second cell.
It is now copied into project-local assets; the original is preserved.

Original generation prompt:

> Use case: stylized-concept. Asset type: a single production sprite atlas for a local AI pet evolution prototype, transparent background. Create exactly ONE atlas, landscape 2:1 aspect ratio, an EXACT 4 columns by 2 rows uniform grid, eight equally sized rectangular cells. Each cell contains one full-body centered creature, no text, no grid lines, no ground, no detached decorative objects, no shadows outside body. Leave at least 12% padding in each cell. Consistent front three-quarter view, feet baseline same relative position. Style: beautifully crafted soft 3D clay collectible creature, silky matte, warm ivory body, big dark expressive eyes, tiny paws, small pale golden diamond forehead mark. A whimsical original animal with rabbit-like ears and long curled tail. This sheet depicts two evolution timelines of the SAME recognizably continuous creature family. TOP ROW left to right: 1 identical warm ivory egg with subtle tiny gold diamond; 2 baby, very round small body, short floppy ears with lavender tips, short curled tail; 3 adolescent of this same baby, slightly taller, longer lavender-tipped ears, tail developing little luminous lavender markings; 4 grown form of same creature, maintain face, forehead diamond and cream body, gracefully longer ears and curled tail, small translucent lavender star-shaped fin on back, lavender luminous tail markings. BOTTOM ROW left to right: 1 the EXACT SAME ivory egg as top left; 2 a second baby with same face and proportions but pale sage ear tips and slightly leaf-shaped curled tail; 3 adolescent of bottom baby, longer sage-tipped ears, small leaf buds on tail; 4 grown form of bottom baby, keep face forehead diamond ivory body and curled tail, sage leaf-shaped ears and small organic leaf fins along tail. All remain adorable animals. Progressive organic growth, not costumes, no clothes, no accessories. The grown forms must clearly be the babies grown up, not different species. Precisely keep each entire sprite in its cell; true transparent alpha, not checkerboard.

Final spacing edit prompt (reference: original generated sheet):

> Edit target: this exact sprite atlas. Preserve all eight designs, identities, appearance, materials, poses, colors and transparency. Change ONLY positioning and scale for clean sprite extraction. Keep exact 4 columns x 2 rows grid. Make EACH creature substantially SMALLER, including tails and ears entirely within middle 70% width and middle 75% height of its own equal cell, with 15% empty transparent padding on ALL sides. Every column center at 12.5%, 37.5%, 62.5%, 87.5% image width. Row centers at 25%,75% image height. Important adolescent and mature tail and ears MUST NOT cross into neighboring cells. Equal cell boxes, identical transparent padding. No texts, no grid lines. Do not crop any sprite. Use the same landscape 2:1 image composition.

The sheet's finite examples are not the product's evolution rules.

## sleep.png

Source: `D:/codex/codex/generated_images/01a16781-00d8-7e71-80c7-39fb92a5dc39/exec-2de477a1-b77b-4367-b0b4-ead053004e3a.png`.

Built-in reference-image generation, with true transparency requested. Input
reference is the same atlas above. Prompt:

> Edit intent identity-preserve, project runtime sleeping pose asset. Input image role: reference character sprite atlas. Use ONLY the baby creature from TOP ROW SECOND CELL: small warm ivory furry rabbit-like fantasy pet, short floppy lavender-tipped ears, dark brown eyes when awake, tiny golden diamond forehead mark, tiny cream paws, small cream curled tail with lavender tip. Generate ONE single full-body sleeping pose of this exact baby, isolated on true transparent background, no other atlas characters or eggs. The pet is curled peacefully low on its belly, eyes fully CLOSED with gentle curved eyelids, chin resting on front paws, floppy ears resting beside its head, lavender tipped small tail curled beside body. Same silky matte soft 3D illustration material, same ivory and pale lavender colors, same golden diamond forehead, same cute baby face. Three-quarter front view facing slightly left. Entire creature including tail visible, generous transparent padding 12% on all sides. Composition wide sleepy silhouette in square canvas, subject centered. No floor, no scenery, no text, no z letters, no detached objects, no background, no checkerboard, no cast ground shadow. This is a sprite for a real-time desktop pet demo, preserve identity and a clean alpha edge.

## Runtime motion

Breathing, bobbing, dust, leaf/paper activation effects and shared task-state
feedback are local Canvas animation. They are not generated animation frames,
not skeletal binding, and not evidence of a working skill/evolution backend.
The sleeping pose and reference hatchling are real generated raster assets.

