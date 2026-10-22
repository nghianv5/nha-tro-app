"""Test các luồng nghiệp vụ chính của API Quản lý nhà trọ."""
from conftest import design_services, make_contract, make_house, make_room


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_seed_data(client):
    houses = client.get("/api/houses").json()
    assert len(houses) >= 7
    addresses = [h["address"] for h in houses]
    assert "370 Bùi Xương Trạch" in addresses
    # Hóa đơn mẫu của thiết kế: phòng 101 nhà 370 BXT, tháng 2026-09, 3.190.000đ, đã TT
    invoices = client.get("/api/invoices", params={"status": "paid"}).json()
    sample = [i for i in invoices if i["month"] == "2026-09"]
    assert sample, "Thiếu hóa đơn mẫu tháng 2026-09"
    assert sample[0]["total"] == 3190000
    assert sample[0]["roomFee"] == 3000000
    assert sum(l["amount"] for l in sample[0]["lines"]) == 190000


def test_dashboard(client):
    d = client.get("/api/dashboard").json()
    for key in ("upcomingPayments", "expiringContracts", "emptyRooms", "deposits",
                "openIncidents", "unpaidInvoices", "notMeteredRooms", "overdueInvoices"):
        assert key in d
    assert d["openIncidents"] >= 1      # sự cố mẫu chưa sửa
    assert d["unpaidInvoices"] >= 1     # hóa đơn mẫu chưa thanh toán
    assert d["deposits"] >= 1           # đặt cọc mẫu


def test_full_flow_monthly_invoice_3190000(client):
    """Tạo nhà → phòng → HĐ → chốt điện → hóa đơn tháng = 3.190.000đ → thanh toán."""
    house = make_house(client, "99 Đường Luồng Test")
    room = make_room(client, house["id"])
    contract = make_contract(client, house["id"], room["id"], phone="0900000011")
    # Chốt điện tháng 10/2026: 20 → 30 (dùng 10 số × 3.000đ = 30.000đ)
    r = client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room["id"], "type": "dien",
        "prev": 20, "current": 30, "date": "2026-10-05"})
    assert r.status_code == 201, r.text
    # Tạo hóa đơn tháng 2026-10
    r = client.post("/api/invoices/monthly", json={"roomId": room["id"], "month": "2026-10"})
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["roomFee"] == 3000000
    by_label = {l["label"]: l for l in inv["lines"]}
    assert by_label["Điện"]["amount"] == 30000 and by_label["Điện"]["qty"] == 10
    assert by_label["Điện"]["prev"] == 20 and by_label["Điện"]["current"] == 30
    assert by_label["Nước"]["amount"] == 80000
    assert by_label["Điện chung"]["amount"] == 30000
    assert by_label["Vệ sinh"]["amount"] == 20000
    assert by_label["Xe máy"]["amount"] == 30000
    assert sum(l["amount"] for l in inv["lines"]) == 190000
    assert inv["total"] == 3190000
    assert inv["status"] == "unpaid"
    # Tạo trùng hóa đơn tháng → 409
    r2 = client.post("/api/invoices/monthly", json={"roomId": room["id"], "month": "2026-10"})
    assert r2.status_code == 409
    # Thanh toán hóa đơn
    r3 = client.put(f"/api/invoices/{inv['id']}", json={"status": "paid"})
    assert r3.status_code == 200 and r3.json()["status"] == "paid"
    # Hợp đồng vẫn đang hiệu lực
    active = client.get("/api/contracts", params={"roomId": room["id"], "status": "active"}).json()
    assert len(active) == 1 and active[0]["id"] == contract["id"]


def test_liquidation_refund_810000(client):
    """Thanh lý đúng ví dụ thiết kế: khách nợ 3.190.000, trả khách 4.000.000
    → hoàn trả khách 810.000đ (phiếu chi), HĐ đóng, phòng về trống."""
    house = make_house(client, "88 Đường Thanh Lý")
    room = make_room(client, house["id"])
    contract = make_contract(client, house["id"], room["id"], phone="0900000022",
                             start="2026-09-01", end="2027-08-31")
    # Chỉ số điện gần nhất = 20
    r = client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room["id"], "type": "dien",
        "prev": 10, "current": 20, "date": "2026-09-10"})
    assert r.status_code == 201
    payload = {"liquidateDate": "2026-09-30", "dienFinal": 30, "nuocFinal": None,
               "refundRoomFee": True, "prepaidRoomFee": 1000000, "confirm": False}
    s = client.post(f"/api/contracts/{contract['id']}/liquidate", json=payload).json()
    assert s["days"] == 30
    assert s["roomOwed"] == 3000000
    assert s["serviceTotal"] == 190000       # điện 30k + nước 80k + đ.chung 30k + vs 20k + xe 30k
    assert s["owedTotal"] == 3190000
    assert s["returnTotal"] == 4000000       # cọc 3.000.000 + phòng thừa 1.000.000
    assert s["net"] == -810000
    assert s["result"] == "refund"
    # Chốt thanh lý thật
    payload["confirm"] = True
    s2 = client.post(f"/api/contracts/{contract['id']}/liquidate", json=payload).json()
    assert s2["result"] == "refund" and "expenseId" in s2
    # HĐ đã đóng
    after = client.get(f"/api/contracts/{contract['id']}").json()
    assert after["status"] == "liquidated"
    active = client.get("/api/contracts", params={"roomId": room["id"], "status": "active"}).json()
    assert active == []
    # Phiếu chi 810.000đ đã ghi
    exps = client.get("/api/expenses", params={"houseId": house["id"]}).json()
    assert any(e["amount"] == 810000 for e in exps)


def test_liquidation_collect_creates_invoice(client):
    """Khách nợ > trả khách → tạo hóa đơn thu thêm (phiếu thu)."""
    house = make_house(client, "77 Đường Thu Thêm")
    room = make_room(client, house["id"])
    contract = make_contract(client, house["id"], room["id"], phone="0900000033",
                             start="2026-09-01", end="2027-08-31")
    client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room["id"], "type": "dien",
        "prev": 10, "current": 20, "date": "2026-09-10"})
    payload = {"liquidateDate": "2026-09-30", "dienFinal": 30, "nuocFinal": None,
               "refundRoomFee": False, "prepaidRoomFee": 0, "confirm": True}
    s = client.post(f"/api/contracts/{contract['id']}/liquidate", json=payload).json()
    assert s["owedTotal"] == 3190000 and s["returnTotal"] == 3000000
    assert s["net"] == 190000 and s["result"] == "collect" and "invoiceId" in s
    inv = client.get(f"/api/invoices/{s['invoiceId']}").json()
    assert inv["kind"] == "other" and inv["total"] == 190000 and inv["status"] == "unpaid"
    assert sum(l["amount"] for l in inv["lines"]) == 190000  # dòng trừ cọc khớp tổng


def test_incident_workflow(client):
    """Sự cố: Chưa sửa → Tiếp nhận sự cố → Đang sửa → Đã sửa."""
    house = make_house(client, "66 Đường Sự Cố")
    room = make_room(client, house["id"])
    r = client.post("/api/incidents", json={
        "houseId": house["id"], "roomId": room["id"], "type": "Hỏng điện",
        "phone": "0984545754", "note": "Chập điện", "status": "Chưa sửa",
        "creator": "Nguyễn Văn T", "date": "2026-10-20"})
    assert r.status_code == 201
    inc = r.json()
    for status, extra in (("Tiếp nhận sự cố", {"assignee": "Nguyễn Văn B"}),
                          ("Đang sửa", {}), ("Đã sửa", {})):
        body = {"status": status}
        body.update(extra)
        rr = client.put(f"/api/incidents/{inc['id']}", json=body)
        assert rr.status_code == 200 and rr.json()["status"] == status
    final = client.get(f"/api/incidents/{inc['id']}").json()
    assert final["assignee"] == "Nguyễn Văn B"


def test_deposit_for_room(client):
    """Đặt cọc phòng: tạo bản ghi cọc và lọc được theo phòng."""
    house = make_house(client, "55 Đường Đặt Cọc")
    room = make_room(client, house["id"])
    r = client.post("/api/deposits", json={
        "houseId": house["id"], "roomId": room["id"], "customerName": "Phạm Thị F",
        "phone": "0912999888", "amount": 1500000, "date": "2026-10-21", "note": "Cọc giữ phòng"})
    assert r.status_code == 201
    deps = client.get("/api/deposits", params={"roomId": room["id"]}).json()
    assert len(deps) == 1 and deps[0]["amount"] == 1500000


def test_landlord_meter_total(client):
    """Chốt điện nước chủ nhà: tổng tự tính = điện + nước + internet + vệ sinh."""
    house = make_house(client, "44 Đường Chủ Nhà")
    r = client.post("/api/landlord-meter-readings", json={
        "houseId": house["id"], "date": "2026-10-31", "dien": 500000,
        "nuoc": 200000, "internet": 300000, "vesinh": 100000})
    assert r.status_code == 201
    assert r.json()["total"] == 1100000


def test_analytics_summary(client):
    a = client.get("/api/analytics/summary").json()
    assert len(a["months"]) == 6
    prev = None
    for row in a["months"]:
        assert row["profit"] == row["income"] - row["expense"]
        if prev is not None:
            assert row["cumulative"] == prev + row["profit"]
        prev = row["cumulative"]
    # Tổng thu toàn kỳ >= 3.190.000đ nhờ hóa đơn mẫu đã thanh toán (tháng 2026-09)
    assert sum(r["income"] for r in a["months"]) >= 3190000


def test_crud_filters_and_delete(client):
    house = make_house(client, "33 Đường Bộ Lọc")
    room = make_room(client, house["id"], name="Phòng Lọc")
    rooms = client.get("/api/rooms", params={"houseId": house["id"]}).json()
    assert len(rooms) == 1 and rooms[0]["id"] == room["id"]
    # Sửa phòng rồi xóa
    rr = client.put(f"/api/rooms/{room['id']}", json={"price": 3500000})
    assert rr.json()["price"] == 3500000
    rd = client.delete(f"/api/rooms/{room['id']}")
    assert rd.status_code == 200
    assert client.get(f"/api/rooms/{room['id']}").status_code == 404


def test_other_invoice_via_api(client):
    """Hóa đơn khác: tạo trực tiếp với dòng thu, tổng tự khớp."""
    house = make_house(client, "22 Đường HĐ Khác")
    room = make_room(client, house["id"])
    r = client.post("/api/invoices", json={
        "kind": "other", "houseId": house["id"], "roomId": room["id"],
        "reason": "Thu tiền vệ sinh", "status": "unpaid", "createdDate": "2026-10-15",
        "lines": [{"label": "Thu tiền vệ sinh", "unitPrice": 30000, "unit": "người",
                   "qty": 2, "amount": 60000}]})
    assert r.status_code == 201
    inv = r.json()
    assert inv["total"] == 60000 and inv["kind"] == "other"
