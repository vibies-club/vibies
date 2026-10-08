TASK: Use your built-in image_gen tool (the $imagegen skill, built-in mode, NOT the CLI) to generate exactly ONE image asset for a website. Do not write code. Then copy the generated file from $CODEX_HOME/generated_images/... to the exact workspace path in OUTPUT, overwriting nothing else, and print the saved path and the exact prompt string you gave image_gen.

REFERENCES (attached): variant-3b-light.png is the approved landing page comp (light pale honey theme, honeycomb hexagons, Vibies bee). bee-mascot.jpg is the official Vibies bee mascot. Match the comp's rendering style: glossy, soft 3D, warm honey gold #f5b73d and amber #d98324 with deep cocoa brown #2a1a08 details, soft warm studio light. No text, no letters, no logos, no watermark. No purple, blue, pink, or neon.

ASSET:
A single small 3D icon object: a glossy honey-gold construction hard hat with a raised amber hexagon emblem on the front (the same hat the Vibies bee wears in bee-mascot.jpg), with three tiny cream hexagon tiles stacked beside it, meaning "built together by the class". Soft 3D, same glossy style and lighting as the other icons, clean silhouette, readable at 90px. TRANSPARENT background: call image_gen with the transparent background option so the PNG has a real alpha channel. Do NOT paint a checkerboard or backdrop. Centered with margin. Square.
OUTPUT: public/home/icon-class.png
