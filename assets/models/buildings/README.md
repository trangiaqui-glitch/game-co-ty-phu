# Mô hình công trình (GLB)

Hiện đang dùng mô hình placeholder dựng bằng code (`src/scene/ModelFactory.js`). Để thay, đặt file GLB
tại đây và khai báo trong `assets/models/manifest.json` mục `"buildings"`. Mặt tiền hướng trục −Z
(về phía đường đi của nhân vật). Mô hình được tự co giãn vừa ô.

| Khoá                 | Dùng cho                              |
| -------------------- | ------------------------------------- |
| `landmark_brown` … `landmark_darkblue` | Công trình của 8 nhóm đất (brown, lightblue, pink, orange, red, yellow, green, darkblue) |
| `station`            | 4 nhà ga                              |
| `utility_electric`   | Công ty Điện lực                      |
| `utility_water`      | Công ty Cấp nước                      |
| `bank`               | Ô Ngân hàng                           |
| `chance` / `community` | Ô Cơ hội / Khí vận                  |
| `tax_income` / `tax_luxury` | Ô thuế                         |
| `start`, `jail`, `park`, `gotojail` | 4 ô góc               |

Nhà (instanced) và khách sạn hiện được dựng bằng code trong `BoardView.js` / `ModelFactory.buildHotel`.
