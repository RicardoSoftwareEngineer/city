Loft furniture shortlist extracted from loft_5_interior_for_free (Sketchfab free).
Sofa/plant/console/coffee/lamp/chair only — no architecture. Albedo textures capped at 256px.
Each piece is floored (minY=0), XZ-centered, Y-up. FBX Z-up meshes (plant/lamp/chair/console)
are corrected with Rx(-90) at extract time; sofa/coffee stay local Y-up. Placement is yaw-only.

Note: chair AABB can still read Z-tall after extract — the apt example sandbox
(src/world/apartments/aptExampleSandbox.js) re-normalizes tallest→Y at load time.
Sandbox loads this file with ?v=apt-example-3 (hard-refresh if the browser caches).
Street catalog picker: empty shell on asphalt + labeled samples on the road; click or __cityAptExample.addFromCatalog(name) to stage into the room.
Mass InstancedMesh bake remains in roomTemplate.js (product path).
