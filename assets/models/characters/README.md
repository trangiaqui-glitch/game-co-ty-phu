# Mô hình nhân vật (GLB)

Bộ nhân vật Quaternius (CC0). Nguồn, giấy phép và mã băm từng file: [`ASSET_LICENSES.md`](../../../ASSET_LICENSES.md).

| File                 | Nhân vật                       | Trạng thái                                    |
| -------------------- | ------------------------------ | --------------------------------------------- |
| `businessman.glb`    | Doanh nhân nam mặc vest        | Có (Quaternius "Business Man")                |
| `businesswoman.glb`  | Nữ doanh nhân                  | Có (Quaternius "Suit")                        |
| `explorer.glb`       | Nhà thám hiểm có ba lô         | Có (Quaternius "Adventurer")                  |
| `engineer.glb`       | Kỹ sư xây dựng đội mũ bảo hộ   | Có (Quaternius "Worker")                      |
| `astronaut.glb`      | Phi hành gia                   | Có (Quaternius "Astronaut")                   |
| `chef.glb`           | Đầu bếp (tuỳ chọn)             | **Chưa có.** Game báo lỗi và dùng mô hình tạm có nhãn "TẠM" |

Ánh xạ clip của bộ này: idle → `Idle`, walk → `Walk`, run → `Run`, celebrate → `Wave`, interact → `Interact`.
- **Không có clip sad:** game tạo `Sad (procedural)` từ Idle trên skeleton của model (ghi rõ trong bảng debug).
- **Không có clip jump:** game ghi cảnh báo trong console.
- Muốn dùng clip thật, thêm vào GLB (ví dụ bằng Blender) với tên `Jump` / `Sad`. Không cần sửa code.

Thêm hoặc thay file:

- Phải có skinned mesh, skeleton (rig) và clip nhúng trong file. Tên clip được ánh xạ theo `animationAliases` trong `src/data/characterConfig.js`.
- Clip nên là "in-place" (không có root motion). Vị trí di chuyển do game điều khiển.
- Kích thước bất kỳ: game tự co giãn đồng đều về cao 1.2 đơn vị và đặt chân chạm mặt bàn.
- Nếu đổi bộ nhân vật, đo lại `walkStride` / `runStride` và `rotationOffset` trong `characterConfig.js`.

Kiểm tra: mở game, nhấn **F2** (bảng debug), hoặc chạy `node tests/character-glb-test.mjs`.
