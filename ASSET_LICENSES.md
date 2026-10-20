# Giấy phép asset

## Nhân vật 3D (`assets/models/characters/`)

Tất cả là model của **Quaternius** (https://quaternius.com), tải từ Poly Pizza ngày 2026-10-20.
Giấy phép trên trang từng model: **Public Domain (CC0 1.0)**: dùng thương mại được, không bắt buộc ghi công.
Chúng tôi vẫn ghi công Quaternius ở đây.

Các file được tải nguyên bản từ `https://static.poly.pizza/<uuid>.glb` và chỉ đổi tên, không chỉnh sửa nội dung.
Cả 5 file thuộc cùng một bộ: rig `CharacterArmature` 62 xương, 24 clip giống nhau, màu nằm trong material (không có texture).

| File trong project  | Model gốc (tên trên Poly Pizza) | Trang nguồn                     | File gốc                                    | Dung lượng   | SHA-256 (16 ký tự đầu) |
| ------------------- | ------------------------------- | ------------------------------- | ------------------------------------------- | ------------ | ---------------------- |
| `businessman.glb`   | Business Man                    | https://poly.pizza/m/JFrLIKqvCH | `e599abbe-7d73-488c-9d7e-3ead281e705c.glb`  | 1 529 248 B  | `82B81257C1E94CD9`     |
| `businesswoman.glb` | Suit                            | https://poly.pizza/m/sOUciDsoVV | `1bd7759c-ab76-4178-8fe6-7706dffa7d5f.glb`  | 1 537 776 B  | `12AECE21FECD08FB`     |
| `explorer.glb`      | Adventurer                      | https://poly.pizza/m/5EGWBMpuXq | `bbe369ee-a686-42c7-adad-14356f5f2f15.glb`  | 1 944 116 B  | `4A8639CD8EEE9D8A`     |
| `engineer.glb`      | Worker                          | https://poly.pizza/m/Yg2bQZO6Hj | `3a5f3056-ffe6-42eb-bd52-122afcbd22b2.glb`  | 1 344 928 B  | `9C28614F465B7DC1`     |
| `astronaut.glb`     | Astronaut                       | https://poly.pizza/m/3hC2i0CTuO | `0076345b-bbea-42d5-931c-4a5ad2050b18.glb`  | 1 944 976 B  | `C825FB5DC0F3C287`     |

Clip có trong cả 5 file (tên đầy đủ có tiền tố `CharacterArmature|`):
Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword,
Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot,
Sword_Slash, Walk, Wave.

Clip **không có**: Jump, Sad (và không có clip ăn mừng riêng; game dùng Wave cho trạng thái ăn mừng).
Clip `Sad (procedural)` do project tạo bằng code (`src/characters/ProceduralClips.js`) từ clip Idle của chính model.
Clip này không nằm trong file GLB và file GLB không bị sửa.

Còn thiếu: `chef.glb`. Chưa tìm được model đầu bếp có rig và animation cùng bộ này.

## Mô hình kiểm thử (`tests/fixtures/robot-expressive/`)

`RobotExpressive.glb`: Tomás Laulhé (Quaternius), chỉnh sửa bởi Don McCurdy. Giấy phép CC0 1.0.
Lấy từ repository three.js r160. Chỉ dùng trong kiểm thử, game không dùng.

## Thư viện

three.js r160: MIT License, tải qua CDN jsDelivr (importmap trong `index.html`).
