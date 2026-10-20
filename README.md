# Cờ Tỷ Phú 3D

Trò chơi Cờ Tỷ Phú (kiểu Monopoly) trên web, phong cách game casual online, hoạt hình 3D:
- Bàn cờ 40 ô dạng thành phố thu nhỏ nổi trên đảo.
- Nhân vật 3D GLB có rig và animation.
- **Chơi online 2–4 người trên nhiều thiết bị** (máy tính, laptop, điện thoại), có sảnh chờ, phòng chơi, mã phòng và lời mời.

Viết bằng HTML, CSS, JavaScript ES Modules và Three.js (r160). Không cần build, không cần cài gói npm: máy chủ chỉ dùng Node.js thuần.

## Chạy game

Game dùng ES Modules nên **phải chạy qua máy chủ web**. Mở file `index.html` trực tiếp (`file://`) sẽ không chạy.

```bash
cd "Project co ty phu"
node server.js          # hoặc: npm start
```

Mở trình duyệt tại **http://localhost:5173**. Đổi cổng: `node server.js 8080`.

- **Chơi online nhiều thiết bị:** máy chủ in ra địa chỉ LAN, ví dụ `Thiết bị khác cùng mạng: http://192.168.1.20:5173`. Mở địa chỉ đó trên điện thoại hoặc máy khác cùng mạng Wi-Fi. Nếu không vào được, hãy mở cổng trong Windows Firewall. Muốn chơi qua Internet thì triển khai `server.js` lên một máy chủ có địa chỉ công khai, hoặc dùng tunnel.
- **Thử nhiều người trên một máy:** mở thêm tab với `?guest`, mỗi tab là một tài khoản khách riêng. Cũng có thể dùng một trình duyệt khác hoặc cửa sổ ẩn danh.
- **Máy chủ tĩnh khác** (`npx serve .`, Live Server…): chỉ chơi được chế độ **Chơi với máy**. Sảnh sẽ báo máy chủ online không khả dụng.
- `?mode=offline` mở thẳng menu chơi với máy.

Yêu cầu: trình duyệt hỗ trợ WebGL2 (Chrome, Edge, Firefox, Safari bản mới) và **có kết nối Internet**, vì Three.js và phông chữ được tải từ CDN (jsDelivr, Google Fonts). Nếu cần chạy offline, tải `three@0.160.0` về máy rồi sửa `importmap` trong `index.html` trỏ tới thư mục cục bộ.

## Sảnh chờ và chơi online

**Sảnh chờ** hiển thị:
- Nhân vật 3D của bạn trên bệ xoay, phát Idle. Kéo để xoay, nhấn để nhân vật vẫy tay.
- Tên (sửa trực tiếp), cấp độ và thanh XP, số xu, số ván, số trận thắng, tỉ lệ thắng, 5 huy hiệu thành tích.
- Danh sách người chơi đang online và các phòng công khai đang chờ.

Tài khoản là **tài khoản khách**: token lưu trong trình duyệt, hồ sơ lưu ở máy chủ trong `data/profiles.json`.

| Nút | Chức năng |
| --- | --- |
| **Chơi ngay** | Ghép vào phòng công khai đang chờ có đông người nhất. Nếu chưa có thì tạo phòng công khai mới và chờ người khác vào. |
| **Tạo phòng** | Tạo phòng riêng, có **mã 5 ký tự**. Nút *Sao chép link mời* tạo link dạng `/?room=MÃ`, ai mở link sẽ vào thẳng phòng. Có thể bấm *Mời* người đang online, họ nhận được lời mời ngay. |
| **Tham gia** | Nhập mã phòng. |
| **Chọn nhân vật** | Chọn 1 trong 6 nhân vật. Trong phòng, nhân vật người khác đã chọn bị khoá. |
| **Chơi với máy** | Chế độ offline cũ: chơi với máy hoặc nhiều người chung một thiết bị. |

**Phòng chơi** có 4 ghế, hiển thị chủ phòng, trạng thái Sẵn sàng và Mất kết nối.
- Chủ phòng có thể *Thêm máy* vào ghế trống, chỉnh tiền khởi điểm, giới hạn vòng và chế độ công khai.
- Nút **Bắt đầu** chỉ bật khi có từ 2 người và mọi người đã sẵn sàng.

**Trong ván online:**
- Mọi thiết bị thấy cùng bàn cờ, cùng xúc xắc, cùng vị trí nhân vật, cùng chủ đất, cùng tiền và cùng lượt chơi.
- Chỉ người đến lượt mới bấm được nút thao tác. Người khác thấy "Đang chờ …".
- Có **đồng hồ 45 giây** mỗi bước. Hết giờ thì máy chơi thay một bước.
- Mất kết nối trong lượt của mình quá 12 giây thì máy chơi thay.
- Tải lại trang giữa ván sẽ tự vào lại đúng ván. Rời ván thì máy chơi thay, và có thể *Quay lại ván* từ sảnh.
- Hết ván: xem kết quả, nhận XP, xu và thành tích, rồi chọn *Chơi lại phòng này* hoặc *Về sảnh*.

**Cách đồng bộ (lockstep, máy chủ có thẩm quyền):**
1. Mọi thiết bị tạo `GameManager` với cùng *seed* và cùng danh sách người chơi.
2. Người chơi chỉ gửi **hành động** (tung, mua, xây…), không gửi trạng thái.
3. Máy chủ chạy một bản `GameManager` không giao diện và chỉ chấp nhận hành động khi đúng người, đúng lượt, đúng trạng thái (`seq`) và hợp lệ theo luật.
4. Hành động hợp lệ được đánh số và phát cho cả phòng.
5. Mỗi thiết bị áp dụng đúng chuỗi đó theo thứ tự, kèm hoạt ảnh 3D.

Logic game tất định theo seed, nên mọi thiết bị luôn có cùng trạng thái. Máy chủ chờ các thiết bị phát xong hoạt ảnh (ack) rồi mới cho máy đi bước tiếp. Người vào lại ván được phát lại toàn bộ chuỗi hành động. Giao tiếp dùng **Server-Sent Events** (máy chủ → trình duyệt) và **POST JSON** (trình duyệt → máy chủ), tự kết nối lại khi rớt mạng.

## Cách chơi

1. Online: vào phòng như trên. Offline (*Chơi với máy*): chọn số người chơi (2–4), nhân vật, tên, và **Người / Máy** cho từng người. Có thể chỉnh tiền khởi điểm, giới hạn vòng, chất lượng đồ hoạ và tốc độ hoạt ảnh. Các lựa chọn được lưu cho lần sau.
2. **Tung xúc xắc**: hai xúc xắc 3D lăn trên bàn, nhân vật đi lần lượt qua từng ô.
3. Khi dừng ở một ô, thẻ thông tin ô hiện ra cho mọi người, gồm tên, giá hoặc chủ đất, và tiền thuê. Đến đất chưa có chủ thì bấm **Mua đất** (hoặc *Bỏ qua*). Đến đất của người khác thì tự động trả tiền thuê: tiền xu bay từ người trả sang người nhận, người trả buồn bã, người nhận ăn mừng.
4. Sở hữu đủ một nhóm màu thì bấm **Xây nhà**. Phải xây đều trong nhóm; 4 nhà nâng lên khách sạn.
5. Bấm **Kết thúc lượt**. Nếu tung được đôi thì được tung tiếp; 3 lần đôi liên tiếp phải vào tù.
6. Ván kết thúc khi chỉ còn một người chưa phá sản, hoặc khi hết số vòng giới hạn (thắng theo tổng tài sản).

| Thao tác | Cách làm |
| --- | --- |
| Xoay / zoom / kéo camera | Kéo chuột trái / cuộn chuột / kéo chuột phải |
| Về góc nhìn mặc định | Nút 🎥 hoặc phím <kbd>C</kbd> |
| Bật / tắt camera theo dõi nhân vật | Nút 👣 |
| Xem thông tin ô (giá, tiền thuê, chủ, số nhà) | Nhấn vào ô trên bàn cờ; camera bay mượt tới ô |
| Xem thông tin người chơi | Nhấn vào nhân vật 3D hoặc thẻ người chơi |
| Bán nhà / thế chấp / chuộc đất | Trong bảng thông tin ô (khi đến lượt bạn) |
| Bảng xếp hạng / Nhật ký sự kiện + giao dịch | Nút 🏆 / 📜 |
| Phím tắt | <kbd>Space</kbd> tung · <kbd>B</kbd> mua · <kbd>H</kbd> xây · <kbd>E</kbd> kết thúc lượt · <kbd>Esc</kbd> đóng bảng ô |

### Luật đã cài đặt

- 40 ô theo cấu trúc cổ điển: 22 ô đất (8 nhóm màu), 4 nhà ga, 2 công ty dịch vụ, 3 Cơ hội, 2 Khí vận, 2 ô thuế, 1 Ngân hàng, và 4 ô góc (Bắt đầu, Nhà tù, Công viên, Vào tù).
- Đi qua ô Bắt đầu nhận $200. Đất trống thuê gấp đôi khi đủ bộ màu. Nhà ga thuê $25 / 50 / 100 / 200. Công ty dịch vụ thu 4× hoặc 10× số xúc xắc.
- 16 thẻ Cơ hội và 16 thẻ Khí vận: di chuyển, nhận / trả tiền, ra tù miễn phí, sửa chữa nhà, trả hoặc thu tiền mỗi người chơi, tới nhà ga hoặc công ty gần nhất.
- Ô Ngân hàng: nhận lãi 5% tiền mặt (tối thiểu $20, tối đa $200).
- Nhà tù: trả $50, dùng thẻ, hoặc tung đôi. Sau 3 lượt thì buộc phải trả $50.
- Thiếu tiền: tự động thế chấp đất lẻ, rồi bán nhà, rồi thế chấp phần còn lại. Vẫn thiếu thì phá sản. Tài sản thuộc về chủ nợ, hoặc trả về ngân hàng nếu nợ ngân hàng.
- Chưa có: đấu giá khi bỏ qua mua đất, và giao dịch / trao đổi đất giữa người chơi (cả offline lẫn online).

## Kiến trúc

```
index.html, styles.css          Giao diện DOM (sảnh, phòng, menu, HUD, bảng, modal) + importmap Three.js
server.js                       Máy chủ Node (không phụ thuộc): file tĩnh + API multiplayer /api; chặn server/ và data/
server/                         MULTIPLAYER (chạy trong Node)
  api.js                        SSE /api/stream + POST /api/cmd, tài khoản khách theo token
  Hub.js                        Người online, phòng (mã, ghế, máy, sẵn sàng, mời), ván thẩm quyền, kiểm tra lượt/seq,
                                đồng hồ lượt, máy chơi thay, chờ ack hoạt ảnh, kết quả + thưởng
  ProfileStore.js               Hồ sơ: tên, nhân vật, XP/cấp, xu, số ván, thắng, thành tích (data/profiles.json)
src/main.js                     Khởi động, loading, sảnh/phòng/ván online, ván offline, picking, controller UI → game
src/net/NetClient.js            Kết nối máy chủ (EventSource tự nối lại + fetch), token khách
src/online/OnlineSession.js     Lockstep phía trình duyệt: áp dụng hành động theo seq, ack, phát hiện mất đồng bộ
src/game/OnlineProtocol.js      Dùng chung máy chủ/trình duyệt: hành động hợp lệ, áp dụng hành động, bước đi của máy
src/game/                       LOGIC THUẦN (không phụ thuộc Three.js, chạy được trong Node)
  GameManager.js                Điều phối luật chơi, lượt, thẻ, phá sản, AI
  BoardManager.js               40 ô sinh từ dữ liệu + toạ độ 3D mỗi ô / điểm đứng của người chơi
  PlayerManager.js              Người chơi (tiền, vị trí, tù, thẻ, phá sản)
  PropertyManager.js            Mua, tiền thuê, xây/bán nhà đều, thế chấp, thanh lý, tài sản ròng
  TurnManager.js                Xúc xắc, pha lượt, vòng chơi
  BankManager.js                Mọi giao dịch tiền + nhật ký giao dịch
  CardDeck.js, AIController.js, NullPresenter.js
src/characters/                 NHÂN VẬT GLB
  CharacterAssetManager.js      Tải/cache GLB, SkeletonUtils.clone, chuẩn hoá scale & chân, trạng thái tải, giải phóng
  CharacterAnimationController.js  1 AnimationMixer/nhân vật, ánh xạ alias clip, crossfade, LoopOnce, cảnh báo clip thiếu
  CharacterController.js        Đặt vị trí, đi theo đường bằng delta time (đồng bộ sải chân), hướng nhìn, vòng chỉ báo lượt/chọn
  CharacterDebugPanel.js        Bảng debug (F2 / 🐞 / ?debug): tải, skeleton, clip, animation đang phát, hộp bao, vị trí chân
src/data/characterConfig.js     Đường dẫn GLB, scale, rotationOffset, footOffset, sải chân, animationAliases của từng nhân vật
src/scene/                      HIỂN THỊ 3D
  SceneManager.js               Renderer, ánh sáng, bóng đổ theo chất lượng, vòng lặp, raycast
  CameraManager.js              OrbitControls, bay mượt, theo dõi nhân vật (chỉ tịnh tiến)
  AssetManager.js               GLTFLoader + cache theo URL, manifest, xử lý lỗi tải
  AnimationManager.js           "Presenter": biến các thay đổi trạng thái thành hoạt ảnh
  BoardView.js                  Đảo nổi, 40 ô, công trình, nhà instanced, cờ sở hữu, thành phố
  ModelFactory.js               Mô hình placeholder (toà nhà, nhà ga, xe, tàu...) + gộp mesh tĩnh
  CharacterFactory.js           Mô hình TẠM (khối hình học) + clip idle/walk/run/jump/celebrate/sad, chỉ dùng khi thiếu GLB
  DiceView.js, EffectsManager.js  Xúc xắc 3D; xu bay, mưa xu, pháo giấy, bụi xây dựng
src/ui/UIManager.js             HUD, menu, bảng ô, thẻ ô vừa đến, xây nhà, xếp hạng, nhật ký, thẻ, thông báo, đồng hồ lượt
src/ui/LobbyUI.js               Sảnh chờ, phòng chơi, chọn nhân vật, lời mời, kết quả + thưởng
src/ui/CharacterPreview.js      Nhân vật 3D động trong sảnh (renderer riêng, chỉ chạy khi hiển thị)
src/characters/ProceduralClips.js  Clip "Sad (procedural)" tạo trên skeleton GLB khi file không có clip buồn
src/data/                       boardData.js (40 ô), characters.js (6 nhân vật), cards.js (32 thẻ)
assets/models/manifest.json     Khai báo GLB thay thế placeholder
tests/                          Kiểm thử logic (Node) và kiểm thử khói trên trình duyệt
```

**Nguyên tắc chính: logic trước, hoạt ảnh sau.** Mọi hành động (mua, xây, trả tiền, di chuyển...) được `GameManager` kiểm tra và áp dụng vào trạng thái *trước*. Sau đó mới gọi `AnimationManager` để phát hoạt ảnh phản ánh trạng thái đã xác nhận. Hành động bị từ chối thì không có hoạt ảnh nào chạy, và lý do được hiện dưới dạng thông báo. Trong lúc hoạt ảnh chạy, game khoá thao tác (`busy`) để không xảy ra xung đột. Mọi nút trên giao diện đều gọi tới chức năng thật; nút bị vô hiệu hoá khi hành động chưa hợp lệ.

## Tối ưu

- Mỗi URL GLB chỉ được tải một lần (cache theo Promise). Vật liệu, hình học và texture canvas đều được cache và dùng chung.
- **Instancing**: nhà trên bàn cờ (tối đa 160 căn) và toàn bộ cây xanh dùng `InstancedMesh`; pháo giấy cũng là một `InstancedMesh`.
- **Gộp mesh tĩnh**: khoảng 500 mesh trang trí được gộp còn khoảng 100 mesh theo vật liệu. Cả cảnh khoảng 230 draw call.
- 3 mức chất lượng (bóng đổ 2048 / 1024 / tắt, giới hạn pixel ratio, số hạt hiệu ứng). Tốc độ hoạt ảnh chỉnh được.
- Có màn hình loading với tiến trình. GLB tải lỗi thì hiện thông báo và dùng mô hình thay thế, game không bị crash. Lỗi JavaScript không bắt được cũng được hiện thành thông báo.

## Nhân vật GLB

> **Trạng thái hiện tại:** 5/6 nhân vật đã có GLB thật. Đó là bộ nhân vật hoạt hình low-poly của **Quaternius**, giấy phép **CC0**: có rig 62 xương, material màu và 24 clip. Nguồn và giấy phép xem [ASSET_LICENSES.md](ASSET_LICENSES.md). 4 nhân vật mặc định khi bắt đầu ván đều dùng GLB. Còn thiếu `chef.glb`: nhân vật Đầu bếp chạy bằng **mô hình tạm** có nhãn rõ ràng.
>
> Clip từ GLB: `Idle`, `Walk`, `Run`, `Wave` (ăn mừng), `Interact` (tung xúc xắc).
>
> Bộ model **không có clip Jump và Sad**:
> - **Sad**: game tạo clip `Sad (procedural)` ngay trên skeleton của từng model, bằng cách lấy clip Idle thật rồi cúi đầu, gù lưng, chùng vai và phát chậm. Bảng debug (F2) ghi rõ đây là "clip tự tạo (không có trong GLB)". Nếu sau này GLB có clip `Sad`/`Defeat`, game dùng clip đó và không tạo nữa.
> - **Jump**: vẫn chưa có. Khi vào tù, nhân vật bay theo đường cong tới phòng giam nhưng không có động tác nhảy.
>
> Thiếu file thì game **luôn báo rõ**: màn hình tải liệt kê từng file, có thông báo lỗi, menu gắn nhãn `TẠM` và hiện cảnh báo, thẻ người chơi trong HUD có nhãn `TẠM`, lỗi được ghi vào console. Bỏ chọn *“Cho phép mô hình tạm”* trong menu thì không thể bắt đầu ván với nhân vật thiếu GLB.

| Nhân vật | File | Model gốc (Quaternius, CC0) |
| --- | --- | --- |
| Doanh nhân nam | `assets/models/characters/businessman.glb` | Business Man |
| Nữ doanh nhân | `assets/models/characters/businesswoman.glb` | Suit |
| Nhà thám hiểm | `assets/models/characters/explorer.glb` | Adventurer |
| Kỹ sư xây dựng | `assets/models/characters/engineer.glb` | Worker |
| Phi hành gia | `assets/models/characters/astronaut.glb` | Astronaut |
| Đầu bếp | `assets/models/characters/chef.glb` | **chưa có** |

Yêu cầu với mỗi file: định dạng glTF binary, có skinned mesh + skeleton, và các animation clip nhúng sẵn. Tên clip được ánh xạ linh hoạt theo `animationAliases` trong [src/data/characterConfig.js](src/data/characterConfig.js) (mặc định: `Idle`, `Walk/Walking`, `Run/Running`, `Jump`, `Celebrate/Victory/Win/Dance/ThumbsUp/Wave`, `Sad/Defeat/Lose`). Clip thiếu thì có cảnh báo trong console (ghi tên nhân vật và tên trạng thái) và được bỏ qua an toàn: run → walk → idle, sad → idle, jump/celebrate không phát.

Chỉnh cho từng model trong `characterConfig.js`:

- `scale`: hệ số thêm sau khi tự chuẩn hoá chiều cao về 1.2 đơn vị. Tỷ lệ luôn đồng đều, không méo.
- `rotationOffset`: xoay quanh Y (radian) nếu mặt model không hướng +Z.
- `footOffset`: chỉnh khi chân bị lún hoặc nổi. Bảng debug hiển thị độ lệch chân thực đo.
- `walkStride` / `runStride`: quãng đường đi được trong một chu kỳ clip, để bước chân khớp tốc độ di chuyển.

**Thử nhanh một GLB mà không sửa code**, qua tham số URL (chỉ chấp nhận đường dẫn tương đối trong project):

```
http://localhost:5173/?model.businessman=assets/models/characters/my_test.glb&debug
```

**Debug:** nhấn **F2** hoặc nút 🐞 (cả trong menu và trong game), hoặc thêm `?debug` vào URL. Bảng debug hiển thị:
- model đã tải chưa, lỗi và đường dẫn;
- skeleton (số xương, số skinned mesh), số material và texture;
- danh sách clip và cách ánh xạ sang từng trạng thái;
- animation đang phát;
- hộp bao, scale, và độ lệch chân so với mặt bàn.

Có thể bật hiển thị skeleton và hộp bao ngay trong cảnh 3D.

**Ánh xạ gameplay → animation:**
- Bắt đầu lượt: IDLE.
- Tung xúc xắc: INTERACT (một lần).
- Di chuyển: WALK, hoặc RUN khi đi từ 7 ô.
- Mua đất, xây nhà, nhận thưởng, nhận tiền thuê: CELEBRATE (một lần).
- Trả tiền thuê: SAD rồi về trạng thái nền.
- Vào tù: JUMP rồi SAD.
- Phá sản: SAD.
- Thắng: CELEBRATE. Animation chỉ được gọi *sau khi* logic game đã xác nhận kết quả.

## Tài nguyên placeholder cần thay bằng GLB chất lượng cao

Ngoài 5 nhân vật GLB ở trên, **các mô hình còn lại là placeholder 3D dựng bằng khối hình học Three.js**: có chiều sâu, đổ bóng, tương tác được, không dùng ảnh 2D. Danh sách cần thay:

| Nhóm | Khoá trong `manifest.json` | Placeholder hiện tại |
| --- | --- | --- |
| Nhân vật Đầu bếp (rig + clip) | **Không dùng manifest**: đặt `chef.glb` theo bảng ở mục *Nhân vật GLB* | `CharacterFactory.js` (mô hình tạm, có nhãn TẠM) |
| Công trình 8 nhóm đất | `buildings.landmark_brown` … `landmark_darkblue` | `ModelFactory.buildLandmark` |
| Nhà ga (kèm tàu hoả) | `buildings.station` | `buildStation`, `buildTrain` |
| Công ty Điện / Nước | `buildings.utility_electric`, `utility_water` | `buildUtility` |
| Ngân hàng | `buildings.bank` | `buildBank` |
| Cơ hội / Khí vận / Thuế | `buildings.chance`, `community`, `tax_income`, `tax_luxury` | `buildQuestionMark`, `buildChest`, `buildMoneyBag`, `buildDiamondRing` |
| Ô góc | `buildings.start`, `jail`, `park`, `gotojail` | `buildStartGate`, `buildJail`, `buildPark`, `buildGoToJail` |
| Nhà, khách sạn, xe, xúc xắc, xu | (cần mở rộng code) | `BoardView.HouseInstancer`, `buildHotel`, `buildCar`, `DiceView`, `EffectsManager` |

Cách thay: chép file `.glb` vào thư mục tương ứng rồi thêm dòng vào `assets/models/manifest.json`, ví dụ:

```json
"buildings":  { "landmark_red": "assets/models/buildings/office_red.glb" }
```

Chi tiết xem README trong từng thư mục `assets/models/*`.

## Kiểm thử

```bash
npm test                          # = node tests/simulate.mjs [số ván]
npm run test:online               # = node tests/online-server-test.mjs
npm run test:browser              # 3 kiểm thử trình duyệt bên dưới (cần Chrome/Edge)
node tests/browser-smoke.mjs      # cần Chrome hoặc Edge (biến CHROME_PATH nếu đặt ở chỗ khác)
node tests/character-glb-test.mjs # hệ thống nhân vật GLB (cần Chrome hoặc Edge)
node tests/online-server-test.mjs # máy chủ multiplayer: 2 thiết bị giả lập qua SSE + HTTP (không cần trình duyệt)
node tests/online-browser-test.mjs # 2 trình duyệt thật (máy tính + điện thoại) chơi online cùng phòng
```

- `tests/character-glb-test.mjs` có ba kịch bản:
  1. **Asset GLB thật của project.** Kiểm tra:
     - GLTFLoader đọc được 5 file; mỗi file có 62 xương, skinned mesh, material;
     - ánh xạ clip Idle/Walk/Run/Wave/Interact; Jump không có nên không được gán; Sad dùng clip tự tạo `Sad (procedural)`;
     - mỗi nhân vật có mixer riêng; khi một người đi, người khác vẫn Idle;
     - chân lệch dưới 0.001 so với mặt bàn;
     - hướng mặt thật (đo từ xương) trùng hướng đi;
     - dừng đúng ô;
     - mua đất phát Wave rồi về Idle, tiền bị trừ đúng;
     - phá sản phát Sad, material không đổi;
     - `chef.glb` thiếu được báo 404.
  2. **Mô hình kiểm thử có rig thật** `tests/fixtures/robot-expressive/RobotExpressive.glb` (CC0 1.0, Tomás Laulhé / Quaternius, lấy từ ví dụ của three.js). Mô hình này **chỉ dùng để kiểm thử**, không phải nhân vật của game, và được nạp qua `?model.<id>=`. Kịch bản kiểm tra:
     - skeleton riêng cho mỗi bản clone, dùng chung geometry/material;
     - GLB chỉ tải 1 lần, kể cả khi bắt đầu ván mới;
     - chân lệch 0 so với mặt bàn, 4 nhân vật đứng chung một ô không chồng nhau;
     - đi với WALK/RUN đúng clip, dừng đúng ô, về IDLE;
     - mua đất phát CELEBRATE (clip `Dance`) rồi tự về IDLE;
     - bấm vào nhân vật thì camera zoom tới;
     - thiếu clip `sad` thì bỏ qua an toàn;
     - material không bị ghi đè;
     - không có lỗi console ngoài các lỗi thiếu GLB đã biết.
  3. **Thiếu GLB (mô phỏng)** bằng `?model.businessman=` trỏ tới file không tồn tại. Kiểm tra lỗi 404 kèm đường dẫn, nhãn `TẠM` đúng nhân vật, và không thể bắt đầu ván khi tắt mô hình tạm.

- `tests/online-server-test.mjs` khởi động máy chủ thật, cho 2 "thiết bị" kết nối qua SSE và HTTP, mỗi thiết bị giữ một `GameManager` riêng. Test kiểm tra:
  - tạo phòng, mời bạn, mã sai, trùng nhân vật, chưa sẵn sàng, người không phải chủ phòng;
  - máy chủ từ chối hành động sai lượt, dựa trên trạng thái cũ, hoặc không hợp lệ;
  - máy chơi thay khi hết giờ;
  - một ván 50 vòng, trạng thái hai thiết bị trùng khớp sau **mọi** hành động, gồm mua đất, trả thuê, xây nhà và vào tù;
  - phát lại khi vào lại ván, thưởng hồ sơ, chơi lại phòng.

  Lần chạy gần nhất: 26/26 đạt, 1.278 lần so sánh, 0 sai khác. Bước xây nhà phụ thuộc vào việc trong ván có người gom đủ một nhóm màu. Ván nào không có ai đủ nhóm màu thì test chỉ in dòng thông tin, không báo lỗi.
- `tests/online-browser-test.mjs` mở 2 Chrome thật: máy tính 1440×900 và điện thoại 390×844 (cảm ứng). Mọi thao tác đều qua giao diện:
  - sảnh, đổi tên, danh sách online, tạo phòng, mời, nhận lời mời, chọn nhân vật, sẵn sàng, thêm máy, bắt đầu;
  - tung xúc xắc và mua đất trên cả hai thiết bị;
  - so trạng thái hai màn hình;
  - kiểm tra bố cục điện thoại;
  - tải lại trang giữa ván, rời ván để máy chơi thay.

  Lần chạy gần nhất: 21/21 đạt.
- `tests/simulate.mjs` chạy một kịch bản thủ công (mua, thuê, xây đều, chặn thế chấp khi còn nhà, phá sản, kết thúc ván) và 60 ván AI đấu AI có seed cố định. Sau **mỗi** thay đổi trạng thái, test kiểm tra các bất biến: tiền không âm, nhà chỉ có khi đủ bộ và xây đều, không có nhà trên đất thế chấp, người phá sản không còn tài sản, tổng tiền khớp với nhật ký ngân hàng. Kết quả lần chạy gần nhất: 60/60 ván, khoảng 153.000 lần kiểm tra, không lỗi.
- `tests/browser-smoke.mjs` mở game trong Chrome headless qua DevTools Protocol và chơi thật bằng các nút giao diện: tung xúc xắc, di chuyển, mua đất, nhấn vào ô trên canvas, kết thúc lượt, để AI chơi, xây nhà (kể cả xây lệch bị chặn), rút thẻ, phá sản, xếp hạng, huỷ ván rồi chơi ván mới, kết thúc ván, và giao diện tablet 1024×768. Test chụp ảnh từng bước và **báo lỗi nếu console có bất kỳ lỗi hay cảnh báo nào**, trừ lỗi 404 của các file GLB nhân vật chưa có (lỗi này được đếm và in riêng). Lần chạy gần nhất: không có lỗi, khoảng 25 FPS trong Chrome headless.

GitHub Actions (`.github/workflows/test.yml`) tự chạy `npm test` và `npm run test:online` mỗi khi push hoặc mở pull request. Kiểm thử trình duyệt không chạy trên CI vì dùng Chrome có GPU. Muốn chạy trên Linux không có GPU thì đặt `SOFTWARE_GL=1`; cách này chậm hơn.

## Đưa lên GitHub và triển khai

`.gitignore` đã loại thư mục `data/`. Thư mục này chứa hồ sơ và **token đăng nhập** của tài khoản khách, nên **không bao giờ commit**.

```bash
git init
git add .
git status            # kiểm tra: không có data/profiles.json
git commit -m "Cờ Tỷ Phú 3D online"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/co-ty-phu-3d.git
git push -u origin main
```

**Chơi trên web:**
- **GitHub Pages** (Settings → Pages → Deploy from branch `main`, thư mục `/`): chỉ phục vụ file tĩnh, nên chơi được **Chơi với máy**. Sảnh sẽ báo máy chủ online không khả dụng.
- **Online nhiều thiết bị qua Internet:** triển khai lên dịch vụ chạy Node.js ≥ 22, ví dụ Render, Railway hoặc Fly.io.
  - Lệnh khởi động: `npm start`. Cổng lấy từ biến môi trường `PORT`.
  - Cấu hình qua biến môi trường:

    | Biến | Ý nghĩa |
    | --- | --- |
    | `DATA_FILE` | Đường dẫn file hồ sơ |
    | `TURN_TIMEOUT_MS` | Thời gian chờ mỗi bước của người chơi |
    | `AI_DELAY_MS` | Nhịp chơi của máy |

  - Gói miễn phí thường xoá ổ đĩa khi khởi động lại. Muốn giữ cấp độ, xu và thành tích thì gắn ổ lưu trữ và trỏ `DATA_FILE` vào đó.

## Giấy phép

Mã nguồn: [MIT](LICENSE). Mô hình nhân vật Quaternius và mô hình kiểm thử RobotExpressive: CC0 1.0. three.js: MIT. Chi tiết xem [ASSET_LICENSES.md](ASSET_LICENSES.md).

## Deploy online (GitHub Pages + máy chủ Node)

GitHub Pages chỉ host file tĩnh, **không chạy được `server.js`**, nên bản trên `*.github.io` sẽ báo "Không kết nối được máy chủ online" nếu chưa có máy chủ riêng.

1. Deploy máy chủ lên [Render](https://render.com) (miễn phí): đăng nhập bằng GitHub → **New → Blueprint** → chọn repo này (đã có sẵn `render.yaml`). Hoặc **New → Web Service**, Start command: `node server.js`.
2. Sau khi deploy xong, mở `https://<tên>.onrender.com/api/health` phải thấy `{"ok":true,...}`.
3. Điền URL đó vào `src/net/config.js`:
   ```js
   export const ONLINE_SERVER = 'https://<tên>.onrender.com';
   ```
   rồi commit/push để GitHub Pages cập nhật.
4. Thử nhanh không cần sửa code: mở `https://<user>.github.io/<repo>/?server=https://<tên>.onrender.com` (được ghi nhớ trong trình duyệt; `?server=` rỗng để xoá).

Lưu ý: gói Free của Render "ngủ" sau ~15 phút không dùng, lần đầu truy cập mất ~30–60 giây để khởi động; hồ sơ người chơi (`data/profiles.json`) bị xoá khi máy chủ khởi động lại. Có thể giới hạn tên miền gọi API bằng biến môi trường `ALLOWED_ORIGIN=https://<user>.github.io`.

## Nhân vật

Mặc định game dùng **nhân vật 3D hoạt hình dựng bằng code** (`buildToonCharacter` trong `src/scene/CharacterFactory.js`, ngoại hình cấu hình trong `src/data/characters.js`), không cần file model. Muốn dùng lại bộ model GLB của Quaternius, mở game với `?style=glb`.
