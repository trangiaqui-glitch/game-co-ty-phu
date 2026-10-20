# Mô hình kiểm thử — KHÔNG phải nhân vật của game

`RobotExpressive.glb` được tải từ repository three.js (r160, `examples/models/gltf/RobotExpressive/`).
Giấy phép **CC0 1.0**: model của Tomás Laulhé (Quaternius), chỉnh sửa bởi Don McCurdy. Xem `SOURCE-README.md`.

File này chỉ dùng trong `tests/character-glb-test.mjs`, để kiểm tra hệ thống nhân vật với một GLB có rig thật:
43 xương, 4 skinned mesh, 14 clip (`Idle`, `Walking`, `Running`, `Jump`, `Dance`… nhưng không có clip "sad").
Game không tự dùng file này. Có thể thử thủ công:

```
http://localhost:5173/?model.businessman=tests/fixtures/robot-expressive/RobotExpressive.glb&debug
```
