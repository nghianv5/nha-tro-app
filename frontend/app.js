'use strict';
/* ================================================================
   QUẢN LÝ NHÀ TRỌ — Frontend SPA
   Dữ liệu nghiệp vụ lấy qua REST API (/api), cache trong biến db.
   ================================================================ */
var API = '/api';
var ENDPOINTS = {
  houses:'houses', rooms:'rooms', customers:'customers', contracts:'contracts',
  meterReadings:'meter-readings', landlordMeterReadings:'landlord-meter-readings',
  invoices:'invoices', vehicles:'vehicles', assets:'assets', services:'services',
  units:'units', expenses:'expenses', incidents:'incidents', deposits:'deposits',
  landlords:'landlords', landlordContracts:'landlord-contracts',
  housePayments:'house-payments', accounts:'accounts'
};
var db = { settings:{ userName:'Nguyễn Văn A', userPhone:'' } };
Object.keys(ENDPOINTS).forEach(function(k){ db[k] = []; });

/* ---------- Xác thực (JWT) ---------- */
var TOKEN_KEY = 'nhatro_token';
var currentUser = null;
function getToken(){ try{ return localStorage.getItem(TOKEN_KEY); }catch(e){ return null; } }
function setToken(t){ try{ t? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }catch(e){} }
function roleLabel(r){ if(r==='admin') return 'Quản trị viên'; if(r==='staff') return 'Nhân viên'; return r||''; }
function syncUserInfo(){
  if(currentUser){ db.settings.userName = currentUser.name; db.settings.userPhone = currentUser.phone || ''; }
}
function doLogout(){ setToken(null); currentUser = null; location.reload(); }
function lockScreen(on){
  document.getElementById('appHeader').style.display = on? 'none':'flex';
  document.getElementById('tabBar').style.display = on? 'none':'flex';
  document.querySelector('.phone').style.paddingBottom = on? '0':'70px';
}

/* ---------- Gọi API ---------- */
function api(path, method, body){
  var headers = { 'Content-Type':'application/json' };
  var tk = getToken();
  if(tk) headers['Authorization'] = 'Bearer ' + tk;
  return fetch(API + path, {
    method: method || 'GET',
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(function(res){
    return res.text().then(function(txt){
      var data = null; try{ data = txt ? JSON.parse(txt) : null; }catch(e){}
      if(!res.ok){
        // Token hết hạn/không hợp lệ -> xóa token, quay về màn hình đăng nhập
        if(res.status === 401 && getToken() && path !== '/auth/login'){ setToken(null); currentUser = null; showLogin('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
        var msg = (data && data.detail) || ('Lỗi ' + res.status); throw new Error(msg);
      }
      return data;
    });
  });
}
function loadColl(coll){ return api('/' + ENDPOINTS[coll]).then(function(list){ db[coll] = list || []; }); }
function loadAll(){
  return Promise.all(Object.keys(ENDPOINTS).map(loadColl)).then(function(){ syncUserInfo(); });
}
function createRec(coll, data){
  return api('/' + ENDPOINTS[coll], 'POST', data).then(function(obj){ db[coll].push(obj); return obj; });
}
function updateRec(coll, id, data){
  return api('/' + ENDPOINTS[coll] + '/' + id, 'PUT', data).then(function(obj){
    var i = db[coll].findIndex(function(x){ return x.id === id; });
    if(i >= 0) db[coll][i] = obj; return obj;
  });
}
function deleteRec(coll, id){
  return api('/' + ENDPOINTS[coll] + '/' + id, 'DELETE').then(function(){
    db[coll] = db[coll].filter(function(x){ return x.id !== id; });
  });
}
function errToast(e){ toast('Lỗi: ' + (e.message || e)); }

/* ---------- Tiện ích chung ---------- */
function fmt(n){ n = Math.round(Number(n)||0); return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'đ'; }
function num(v){ var x = parseInt(String(v==null?'':v).replace(/[^\d-]/g,''),10); return isNaN(x)?0:x; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function curMonth(){ return today().slice(0,7); }
function fmtDate(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso; }
function diffDays(a,b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000); }
function monthLabel(ym){ var p=ym.split('-'); return 'Tháng ' + Number(p[1]) + '/' + p[0]; }
function toast(msg){ var t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); },2200); }
function val(id){ var e=document.getElementById(id); return e? e.value.trim() : ''; }
function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }

/* ---------- Truy vấn theo quan hệ (trên cache) ---------- */
function houseName(id){ var h=byId(db.houses,id); return h? h.address : ''; }
function roomName(id){ var r=byId(db.rooms,id); return r? r.name : ''; }
function customerName(id){ var c=byId(db.customers,id); return c? c.name : ''; }
function activeContract(roomId){ for(var i=0;i<db.contracts.length;i++){ var c=db.contracts[i]; if(c.roomId===roomId && c.status==='active') return c; } return null; }
function roomStatus(room){ if(activeContract(room.id)) return 'rented'; for(var i=0;i<db.deposits.length;i++) if(db.deposits[i].roomId===room.id) return 'deposited'; return 'empty'; }
function statusBadge(st){ if(st==='rented') return '<span class="badge b-rented">Đã thuê</span>'; if(st==='deposited') return '<span class="badge b-deposited">Đã cọc</span>'; return '<span class="badge b-empty">Trống</span>'; }
function unitName(id){ var u=byId(db.units,id); return u? u.name : ''; }
function landlordName(id){ var l=byId(db.landlords,id); return l? l.name : ''; }
function lastReading(roomId, type){
  var list = db.meterReadings.filter(function(m){ return m.roomId===roomId && m.type===type; });
  list.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });
  return list.length? list[list.length-1] : null;
}

/* ================================================================
   0) ĐĂNG NHẬP — hiển thị khi chưa có token hợp lệ
   ================================================================ */
function showLogin(errMsg, keepPhone){
  lockScreen(true);
  navStack = [];
  var phone = keepPhone || '';
  document.getElementById('app').innerHTML =
    '<div class="login-wrap"><form class="login-card" onsubmit="event.preventDefault();doLogin();">' +
    '<div class="login-logo">🏠</div>' +
    '<h2>Quản lý nhà trọ</h2>' +
    '<div class="login-sub">Đăng nhập để tiếp tục</div>' +
    (errMsg? '<div class="err-msg">'+esc(errMsg)+'</div>' : '') +
    fld('Số điện thoại', '<input id="lg_phone" type="tel" inputmode="tel" autocomplete="username" value="'+esc(phone)+'" placeholder="VD: 0901234567">', true) +
    fld('Mật khẩu', '<div class="pw-wrap"><input id="lg_password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu">' +
      '<button type="button" class="pw-eye" onclick="togglePw(\'lg_password\', this)">👁️</button></div>', true) +
    '<button class="btn" id="lg_btn" type="submit">Đăng nhập</button>' +
    '<div class="login-hint">Tài khoản mẫu — Admin: 0901234567 / admin123<br>Nhân viên: 0901234568 / 123456</div>' +
    '</form></div>';
  var inp = document.getElementById('lg_phone');
  if(inp) inp.focus();
}
function togglePw(id, btn){
  var e = document.getElementById(id); if(!e) return;
  var show = e.type === 'password';
  e.type = show? 'text' : 'password';
  btn.textContent = show? '🙈' : '👁️';
}
function doLogin(){
  var phone = val('lg_phone'), password = val('lg_password');
  if(!phone || !password){ showLogin('Vui lòng nhập đầy đủ số điện thoại và mật khẩu.', phone); return; }
  var btn = document.getElementById('lg_btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Đang đăng nhập...'; }
  setToken(null); // tránh vòng lặp 401 khi token cũ còn sót
  api('/auth/login', 'POST', { phone: phone, password: password }).then(function(res){
    setToken(res.access_token);
    currentUser = res.user;
    lockScreen(false);
    return loadAll();
  }).then(function(){
    navStack = []; curView = 'home'; curParams = {}; render();
    toast('Xin chào, ' + currentUser.name);
  }).catch(function(e){
    showLogin(e.message || 'Đăng nhập thất bại. Vui lòng thử lại.', phone);
  });
}

/* ---------- Điều hướng SPA ---------- */
var navStack = [];
var curView = 'home', curParams = {};
var VIEWS = {};
function show(view, params){ navStack.push({view:curView, params:curParams}); curView = view; curParams = params||{}; render(); }
function replace(view, params){ curView = view; curParams = params||{}; render(); }
function goBack(){ var prev = navStack.pop(); if(prev){ curView = prev.view; curParams = prev.params; } else { curView='home'; curParams={}; } render(); }
function goTab(tab){
  navStack = [];
  if(tab==='home') replace('home');
  else if(tab==='rooms') replace('houses');
  else if(tab==='invoices') replace('invoices');
  else if(tab==='incidents') replace('incidents');
  else if(tab==='menu') replace('menu');
}
function setHeader(title, canBack){
  document.getElementById('hdrTitle').textContent = title;
  document.getElementById('btnBack').style.display = canBack? 'inline-block':'none';
  var tabOf = {home:'home', houses:'rooms', rooms:'rooms', rooms_all:'rooms', roomDetail:'rooms', invoices:'invoices', invoiceDetail:'invoices', incidents:'incidents', incidentDetail:'incidents', menu:'menu'};
  document.querySelectorAll('nav.tabs-bar a').forEach(function(a){ a.classList.toggle('on', a.getAttribute('data-tab') === (tabOf[curView]||'')); });
}
function render(){
  var v = VIEWS[curView] || VIEWS.home;
  var out = v(curParams||{});
  document.getElementById('app').innerHTML = out.html;
  setHeader(out.title, navStack.length>0);
  window.scrollTo(0,0);
  if(out.after) out.after();
}
function confirmBox(msg, cbName, arg){
  var old = document.getElementById('cfm'); if(old) old.remove();
  var m = document.createElement('div'); m.className='modal'; m.id='cfm';
  m.innerHTML = '<div class="box"><h3>Xác nhận</h3><p style="color:#616161;font-size:14px">'+esc(msg)+'</p>'+
    '<button class="btn red" onclick="'+cbName+'(\''+arg+'\');document.getElementById(\'cfm\').remove()">Đồng ý</button>'+
    '<button class="btn gray" onclick="document.getElementById(\'cfm\').remove()">Hủy</button></div>';
  document.body.appendChild(m);
}

/* ---------- Thành phần form dùng chung ---------- */
function fld(label, inner, req){ return '<label class="fl">'+label+(req?' <b>*</b>':'')+'</label>'+inner; }
function inp(id, v, ph, type){ return '<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(v==null?'':v)+'" placeholder="'+esc(ph||'')+'">'; }
function inpNum(id, v, ph){ return '<input id="'+id+'" type="number" inputmode="numeric" value="'+(v==null?'':v)+'" placeholder="'+esc(ph||'')+'">'; }
function inpDate(id, v){ return '<input id="'+id+'" type="date" value="'+esc(v||'')+'">'; }
function sel(id, options, cur){
  var h = '<select id="'+id+'">';
  options.forEach(function(o){ var v = Array.isArray(o)? o[0] : o, t = Array.isArray(o)? o[1] : o;
    h += '<option value="'+esc(v)+'"'+(String(v)===String(cur)?' selected':'')+'>'+esc(t)+'</option>'; });
  return h + '</select>';
}
function houseSel(id, cur, allLabel){
  var opts = []; if(allLabel!==undefined) opts.push(['', allLabel]);
  db.houses.forEach(function(h){ opts.push([h.id, h.address]); });
  return sel(id, opts, cur||'');
}
function roomSel(id, houseId, cur, emptyLabel){
  var opts = []; if(emptyLabel!==undefined) opts.push(['', emptyLabel]);
  db.rooms.filter(function(r){ return !houseId || r.houseId===houseId; }).forEach(function(r){ opts.push([r.id, r.name]); });
  return sel(id, opts, cur||'');
}
function fabBtn(onclick){ return '<button class="fab" onclick="'+onclick+'">+</button>'; }
function delBtn(fn, id){ return '<button class="btn red" onclick="confirmBox(\'Bạn chắc chắn muốn xóa mục này?\',\''+fn+'\',\''+id+'\')">Xóa</button>'; }

/* ================================================================
   1) HOME — tổng quan + danh sách nhà
   ================================================================ */
VIEWS.home = function(){
  var cm = curMonth();
  var unpaid = db.invoices.filter(function(i){ return i.status==='unpaid'; });
  var upcoming = unpaid.reduce(function(s,i){ return s+i.total; }, 0);
  var expiring = db.contracts.filter(function(c){ return c.status==='active' && c.endDate >= today() && diffDays(today(), c.endDate) <= 30; });
  var overdue = unpaid.filter(function(i){ return i.month && i.month < cm; });
  var emptyRooms = db.rooms.filter(function(r){ return roomStatus(r)==='empty'; }).length;
  var notMetered = db.rooms.filter(function(r){ var c = activeContract(r.id); if(!c) return false; var lr = lastReading(r.id,'dien'); return !(lr && (lr.date||'').slice(0,7)===cm); }).length;
  var openInc = db.incidents.filter(function(i){ return i.status!=='Đã sửa'; }).length;
  var stat = function(n, l, v, p){ return '<div class="stat" onclick="show(\''+v+'\','+(p?JSON.stringify(p):'{}')+')"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; };
  var h = '<div class="hero"><div>Tiền thanh toán sắp tới</div><div class="big">'+fmt(upcoming)+'</div>'+
    '<div>Sắp hết hợp đồng: <b>'+expiring.length+'</b> hợp đồng</div></div>';
  h += '<div class="grid2">'+
    stat(emptyRooms,'Phòng trống','houses')+
    stat(db.deposits.length,'Cọc','deposits')+
    stat(openInc,'Sự cố chưa hoàn thành','incidents')+
    stat(unpaid.length,'Hóa đơn chưa thanh toán','invoices')+
    stat(notMetered,'Chưa chốt điện nước','meter',{type:'dien'})+
    stat(expiring.length,'Sắp hết hạn hợp đồng','contracts',{tab:'expiring'})+
    stat(overdue.length,'Quá hạn thanh toán','invoices',{status:'unpaid'})+
    '</div>';
  h += '<div class="secttl">Danh sách nhà</div>';
  db.houses.forEach(function(hs){
    var rs = db.rooms.filter(function(r){ return r.houseId===hs.id; });
    var tr = rs.filter(function(r){ return roomStatus(r)==='empty'; }).length;
    h += '<div class="card" onclick="show(\'rooms\',{houseId:\''+hs.id+'\'})"><div class="row"><h3>'+esc(hs.address)+'</h3><span class="badge '+(hs.type==='rented'?'b-deposited':'b-paid')+'">'+(hs.type==='rented'?'Nhà thuê':'Nhà của mình')+'</span></div>'+
      '<div class="sub">'+rs.length+' phòng • '+tr+' phòng trống • '+esc(hs.district)+', '+esc(hs.province)+'</div></div>';
  });
  return { title:'Quản lý nhà trọ', html:h };
};

/* ================================================================
   2) MENU — danh mục module
   ================================================================ */
VIEWS.menu = function(){
  var items = [
    ['rooms_all','🚪','Quản lý phòng'], ['houses','🏠','Quản lý nhà'], ['landlords','👤','Chủ nhà'],
    ['contracts','📄','Hợp đồng'], ['customers','👥','Khách hàng'], ['assets','🛋️','Tài sản'],
    ['services','🧰','Dịch vụ'], ['units','📏','Đơn vị tính'], ['expenses','💸','Chi tiêu'],
    ['vehicles','🛵','Xe'], ['deposits','💰','Đặt cọc'], ['landlordMeter','💡','Chốt điện nước chủ nhà'],
    ['housePayments','🏦','Thanh toán tiền nhà'], ['accounts','🔐','Phân quyền'], ['analytics','📊','Phân tích'],
    ['settings','⚙️','Cài đặt']
  ];
  var u = currentUser || { name: db.settings.userName, phone: db.settings.userPhone, role: '' };
  var h = '<div class="card static"><div class="row" style="justify-content:flex-start"><div class="avatar">'+esc((u.name||'A').charAt(0))+'</div>'+
    '<div><h3>'+esc(u.name)+'</h3><div class="sub">'+esc(u.phone || '')+(u.role? ' • '+esc(roleLabel(u.role)) : '')+'</div></div></div></div>';
  items.forEach(function(it){ h += '<div class="menu-item" onclick="show(\''+it[0]+'\')"><span class="ic">'+it[1]+'</span>'+it[2]+'</div>'; });
  h += '<div class="menu-item danger" onclick="confirmBox(\'Bạn muốn đăng xuất khỏi ứng dụng?\',\'doLogout\',\'x\')"><span class="ic">🚪</span>Đăng xuất</div>';
  return { title:'Menu', html:h };
};

/* ================================================================
   3+4) NHÀ — danh sách (lọc) + form thêm/sửa
   ================================================================ */
VIEWS.houses = function(p){
  var provs = [], dists = [], wards = [];
  db.houses.forEach(function(h){ if(provs.indexOf(h.province)<0) provs.push(h.province); if(dists.indexOf(h.district)<0) dists.push(h.district); if(wards.indexOf(h.ward)<0) wards.push(h.ward); });
  var f = p.f||{};
  var h = '<div class="card static"><b>Lọc nhà</b>'+
    fld('Tỉnh / Thành phố', sel('f_province', [['','Tất cả']].concat(provs), f.province||''))+
    fld('Quận / Huyện', sel('f_district', [['','Tất cả']].concat(dists), f.district||''))+
    fld('Phường / Xã', sel('f_ward', [['','Tất cả']].concat(wards), f.ward||''))+
    '<button class="btn sm" onclick="applyHouseFilter()">Lọc</button></div>';
  var list = db.houses.filter(function(hs){ return (!f.province||hs.province===f.province) && (!f.district||hs.district===f.district) && (!f.ward||hs.ward===f.ward); });
  if(!list.length) h += '<div class="empty-note">Chưa có nhà nào</div>';
  list.forEach(function(hs){
    h += '<div class="card" onclick="show(\'rooms\',{houseId:\''+hs.id+'\'})"><h3>'+esc(hs.address)+'</h3>'+
      '<div class="sub">Diện tích sàn: '+hs.floorArea+'m2 • Số tầng: '+hs.floors+' • Số phòng ngủ: '+hs.bedrooms+' • Số nhà tắm: '+hs.bathrooms+'<br>'+esc(hs.ward)+', '+esc(hs.district)+', '+esc(hs.province)+' • '+(hs.type==='rented'?'Nhà thuê':'Nhà của mình')+'</div></div>';
  });
  h += fabBtn("show('houseForm')");
  return { title:'Danh sách nhà trọ', html:h };
};
function applyHouseFilter(){ replace('houses', {f:{province:val('f_province'), district:val('f_district'), ward:val('f_ward')}}); }
VIEWS.houseForm = function(p){
  var hs = p.id? byId(db.houses, p.id) : {address:'',province:'Hà Nội',district:'',ward:'',floors:1,floorArea:0,bedrooms:0,bathrooms:0,type:'own',landlordId:null};
  var h = '<div class="card static">'+
    fld('Địa chỉ nhà', inp('h_address', hs.address, 'VD: 370 Bùi Xương Trạch'), true)+
    fld('Tỉnh / Thành phố', inp('h_province', hs.province))+
    fld('Quận / Huyện', inp('h_district', hs.district))+
    fld('Phường / Xã', inp('h_ward', hs.ward))+
    fld('Số tầng', inpNum('h_floors', hs.floors))+
    fld('Diện tích sàn (m2)', inpNum('h_floorArea', hs.floorArea))+
    fld('Số phòng ngủ', inpNum('h_bedrooms', hs.bedrooms))+
    fld('Số nhà tắm', inpNum('h_bathrooms', hs.bathrooms))+
    fld('Loại nhà', sel('h_type', [['own','Nhà của mình'],['rented','Nhà thuê']], hs.type))+
    fld('Chủ nhà (nếu là nhà thuê)', sel('h_landlord', [['','-- Không chọn --']].concat(db.landlords.map(function(l){ return [l.id, l.name]; })), hs.landlordId||''))+
    '<button class="btn" onclick="saveHouse(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm nhà')+'</button>'+
    (p.id? delBtn('doDeleteHouse', p.id):'')+
    '</div>';
  return { title: p.id? 'Sửa nhà':'Thêm nhà', html:h };
};
function saveHouse(id){
  var address = val('h_address'); if(!address){ toast('Vui lòng nhập địa chỉ nhà'); return; }
  var data = { address:address, province:val('h_province'), district:val('h_district'), ward:val('h_ward'),
    floors:num(val('h_floors')), floorArea:num(val('h_floorArea')), bedrooms:num(val('h_bedrooms')), bathrooms:num(val('h_bathrooms')),
    type:val('h_type'), landlordId: val('h_landlord')||null };
  var pr = id? updateRec('houses', id, data) : createRec('houses', data);
  pr.then(function(){ toast('Đã lưu nhà'); goBack(); }).catch(errToast);
}
function doDeleteHouse(id){
  deleteRec('houses', id).then(function(){
    db.rooms = db.rooms.filter(function(r){ return r.houseId!==id; });
    toast('Đã xóa nhà'); replace('houses');
  }).catch(errToast);
}

/* ================================================================
   5) PHÒNG — danh sách theo nhà + tất cả phòng
   ================================================================ */
function roomCard(r){
  var st = roomStatus(r);
  return '<div class="card" onclick="show(\'roomDetail\',{id:\''+r.id+'\'})"><div class="row"><h3>'+esc(r.name)+'</h3>'+statusBadge(st)+'</div>'+
    '<div class="sub">'+esc(houseName(r.houseId))+' • '+esc(r.type)+' • '+esc(r.toilet)+'</div>'+
    '<div class="row"><span class="sub">Tầng '+r.floor+' • '+r.area+'m2</span><span class="price">'+fmt(r.price)+'</span></div></div>';
}
VIEWS.rooms = function(p){
  var hs = byId(db.houses, p.houseId); if(!hs) return VIEWS.houses(p);
  var rs = db.rooms.filter(function(r){ return r.houseId===hs.id; });
  var nEmpty = rs.filter(function(r){ return roomStatus(r)==='empty'; }).length;
  var nRented = rs.filter(function(r){ return roomStatus(r)==='rented'; }).length;
  var nDep = rs.filter(function(r){ return roomStatus(r)==='deposited'; }).length;
  var openInc = db.incidents.filter(function(i){ return i.houseId===hs.id && i.status!=='Đã sửa'; }).length;
  var uncollected = db.invoices.filter(function(i){ return i.houseId===hs.id && i.status==='unpaid'; }).reduce(function(s,i){ return s+i.total; },0);
  var filter = p.filter||'all';
  var h = '<div class="hero"><div>'+esc(hs.address)+'</div><div class="big">'+rs.length+' phòng</div>'+
    '<div>Trống: '+nEmpty+' • Đã thuê: '+nRented+' • Đã cọc: '+nDep+' • Sự cố chưa xong: '+openInc+'</div>'+
    '<div>Chưa thu: '+fmt(uncollected)+'</div></div>';
  h += '<div class="tabs"><div class="tab'+(filter==='all'?' on':'')+'" onclick="replace(\'rooms\',{houseId:\''+hs.id+'\',filter:\'all\'})">Tất cả</div>'+
    '<div class="tab'+(filter==='empty'?' on':'')+'" onclick="replace(\'rooms\',{houseId:\''+hs.id+'\',filter:\'empty\'})">Phòng trống</div>'+
    '<div class="tab'+(filter==='rented'?' on':'')+'" onclick="replace(\'rooms\',{houseId:\''+hs.id+'\',filter:\'rented\'})">Đã thuê</div></div>';
  var list = rs.filter(function(r){ return filter==='all' || roomStatus(r)===filter; });
  if(!list.length) h += '<div class="empty-note">Không có phòng nào</div>';
  list.forEach(function(r){ h += roomCard(r); });
  h += fabBtn("show('roomForm',{houseId:'"+hs.id+"'})");
  h += '<div class="btnrow"><button class="btn gray" onclick="show(\'houseForm\',{id:\''+hs.id+'\'})">Sửa thông tin nhà</button>'+
    '<button class="btn" onclick="show(\'contracts\',{houseId:\''+hs.id+'\'})">Hợp đồng nhà này</button></div>';
  return { title: hs.address, html:h };
};
VIEWS.rooms_all = function(){
  var h = '';
  if(!db.rooms.length) h += '<div class="empty-note">Chưa có phòng nào</div>';
  db.rooms.forEach(function(r){ h += roomCard(r); });
  return { title:'Quản lý phòng', html:h };
};
/* ================================================================
   6) THÊM / SỬA PHÒNG — form đầy đủ theo thiết kế + popup thành công
   ================================================================ */
var AMENITIES = ['Ban công','Sân phơi','Cửa sổ','Bếp','Gác xép','Có chỗ để xe máy','Có chỗ để ô tô','Có chỗ để sạc xe điện'];
var ROOM_TYPES = ['Khép kín','Không khép kín','Homestay','Phòng đơn','Studio','1 ngủ 1 khách','2 ngủ 1 khách','3 ngủ 1 khách'];
var TOILETS = ['Khép kín','Vệ sinh riêng','Vệ sinh chung'];
var ASSET_STATUS = ['Mới','Như mới','Tốt','Cũ','Hỏng','Mất'];

function assetRowHTML(a){
  a = a||{code:'',type:'',status:'Tốt'};
  return '<div class="row asset-row" style="margin-bottom:6px"><input placeholder="Mã tài sản" class="a-code" value="'+esc(a.code)+'" style="flex:1">'+
    '<input placeholder="Loại tài sản" class="a-type" value="'+esc(a.type)+'" style="flex:1">'+
    '<select class="a-status" style="flex:1">'+ASSET_STATUS.map(function(s){ return '<option'+(s===a.status?' selected':'')+'>'+s+'</option>'; }).join('')+'</select>'+
    '<button class="btn sm red" onclick="this.parentNode.remove()">×</button></div>';
}
function svcRowHTML(s){
  s = s||{name:'',price:'',unit:'người'};
  return '<div class="row svc-row" style="margin-bottom:6px"><input placeholder="Tên dịch vụ" class="s-name" value="'+esc(s.name)+'" style="flex:1.2">'+
    '<input placeholder="Giá" type="number" class="s-price" value="'+esc(s.price)+'" style="flex:1">'+
    '<select class="s-unit" style="flex:1">'+['số','người','phòng','xe','tháng'].map(function(u){ return '<option'+(u===s.unit?' selected':'')+'>'+u+'</option>'; }).join('')+'</select>'+
    '<button class="btn sm red" onclick="this.parentNode.remove()">×</button></div>';
}
VIEWS.roomForm = function(p){
  var isEdit = !!p.id;
  var r = isEdit? byId(db.rooms, p.id) : (p.copyFrom? byId(db.rooms, p.copyFrom) : null);
  var houseId = isEdit? r.houseId : (p.houseId || (r? r.houseId : (db.houses[0]||{}).id));
  var base = r? JSON.parse(JSON.stringify(r)) : {name:'',floor:1,area:'',type:'Khép kín',toilet:'Khép kín',withOwner:false,price:'',minDeposit:'',maxPeople:'',payMonths:1,payFromDay:1,payToDay:3,amenities:[],services:{dien:3000,dienChung:30000,internet:50000,extra:[]}};
  if(!isEdit && p.copyFrom){ base.name=''; }
  if(!base.services) base.services = {dien:3000,dienChung:30000,internet:50000,extra:[]};
  if(!base.services.extra) base.services.extra = [];
  var assets = isEdit? db.assets.filter(function(a){ return a.roomId===r.id; }) : [];
  var h = '<div class="card static">'+ fld('Nhà', houseSel('r_house', houseId))+
    fld('Tên phòng', inp('r_name', base.name, 'VD: Phòng 101'), true)+
    fld('Tầng', inpNum('r_floor', base.floor))+
    fld('Diện tích (m2)', inpNum('r_area', base.area))+
    fld('Loại phòng', sel('r_type', ROOM_TYPES, base.type))+
    fld('Vệ sinh', sel('r_toilet', TOILETS, base.toilet))+
    '<label class="chk"><input type="checkbox" id="r_withOwner"'+(base.withOwner?' checked':'')+'> Chung chủ</label>'+
    fld('Giá phòng (vnđ)', inpNum('r_price', base.price), true)+
    fld('Cọc tối thiểu (vnđ)', inpNum('r_minDeposit', base.minDeposit))+
    fld('Số người ở tối đa', inpNum('r_maxPeople', base.maxPeople))+
    fld('Số tháng thanh toán 1 lần', inpNum('r_payMonths', base.payMonths), true)+
    '<div class="row"><div style="flex:1">'+fld('Thanh toán từ ngày', inpNum('r_payFrom', base.payFromDay))+'</div><div style="flex:1">'+fld('đến ngày', inpNum('r_payTo', base.payToDay))+'</div></div>'+
    '<div class="secttl">Tiện ích</div><div class="chips">'+
    AMENITIES.map(function(a){ var on = (base.amenities||[]).indexOf(a)>=0; return '<span class="chip amen-chip'+(on?' on':'')+'" data-amen="'+esc(a)+'" onclick="this.classList.toggle(\'on\')">'+a+'</span>'; }).join('')+'</div>'+
    '<div class="secttl">Tài sản của phòng</div><div id="assetRows">'+assets.map(assetRowHTML).join('')+'</div>'+
    '<button class="btn sm gray" onclick="document.getElementById(\'assetRows\').insertAdjacentHTML(\'beforeend\', assetRowHTML())">+ Thêm tài sản</button>'+
    '<div class="secttl">Dịch vụ của phòng</div>'+
    fld('Điện (vnđ/số)', inpNum('r_svcDien', base.services.dien))+
    fld('Điện chung (vnđ/người)', inpNum('r_svcDienChung', base.services.dienChung))+
    fld('Internet (vnđ/người)', inpNum('r_svcInternet', base.services.internet))+
    '<div id="svcRows">'+base.services.extra.map(svcRowHTML).join('')+'</div>'+
    '<button class="btn sm gray" onclick="document.getElementById(\'svcRows\').insertAdjacentHTML(\'beforeend\', svcRowHTML())">+ Thêm dịch vụ</button>'+
    '<button class="btn" onclick="saveRoom(\''+(isEdit? r.id:'')+'\')">'+(isEdit?'Cập nhật phòng':'Thêm phòng')+'</button>'+
    (isEdit? delBtn('doDeleteRoom', r.id):'')+
    '</div>';
  return { title: isEdit? 'Sửa phòng':'Thêm phòng', html:h };
};
function collectRoomAssets(roomId, houseId){
  // Đồng bộ tài sản của phòng qua API: xóa tài sản cũ không còn trong form, thêm/cập nhật phần còn lại
  var rows = [];
  document.querySelectorAll('.asset-row').forEach(function(row){
    var code = row.querySelector('.a-code').value.trim(), type = row.querySelector('.a-type').value.trim();
    if(code || type) rows.push({code:code, type:type, status:row.querySelector('.a-status').value});
  });
  var olds = db.assets.filter(function(a){ return a.roomId===roomId; });
  var jobs = olds.map(function(a){ return deleteRec('assets', a.id); });
  return Promise.all(jobs).then(function(){
    return Promise.all(rows.map(function(x){ return createRec('assets', {houseId:houseId, roomId:roomId, code:x.code, type:x.type, status:x.status}); }));
  });
}
function saveRoom(editId){
  var name = val('r_name'); if(!name){ toast('Vui lòng nhập tên phòng'); return; }
  var price = num(val('r_price')); if(!price){ toast('Vui lòng nhập giá phòng'); return; }
  var amenities = []; document.querySelectorAll('.amen-chip.on').forEach(function(c){ amenities.push(c.getAttribute('data-amen')); });
  var extra = []; document.querySelectorAll('.svc-row').forEach(function(row){
    var n = row.querySelector('.s-name').value.trim(); if(n) extra.push({name:n, price:num(row.querySelector('.s-price').value), unit:row.querySelector('.s-unit').value});
  });
  var data = { houseId: val('r_house'), name:name, floor:num(val('r_floor')), area:num(val('r_area')), type:val('r_type'), toilet:val('r_toilet'),
    withOwner: document.getElementById('r_withOwner').checked, price:price, minDeposit:num(val('r_minDeposit')), maxPeople:num(val('r_maxPeople')),
    payMonths:num(val('r_payMonths'))||1, payFromDay:num(val('r_payFrom')), payToDay:num(val('r_payTo')), amenities:amenities,
    services:{ dien:num(val('r_svcDien')), dienChung:num(val('r_svcDienChung')), internet:num(val('r_svcInternet')), extra:extra } };
  var pr = editId? updateRec('rooms', editId, data) : createRec('rooms', data);
  pr.then(function(room){
    return collectRoomAssets(room.id, room.houseId).then(function(){
      if(editId){ toast('Đã cập nhật phòng'); goBack(); }
      else showRoomAddedPopup(room.id, room.houseId);
    });
  }).catch(errToast);
}
function showRoomAddedPopup(roomId, houseId){
  var old = document.getElementById('cfm'); if(old) old.remove();
  var m = document.createElement('div'); m.className='modal'; m.id='cfm';
  m.innerHTML = '<div class="box"><h3>Thêm phòng thành công</h3><p style="color:#616161;font-size:14px">Bạn muốn tiếp tục thêm phòng?</p>'+
    '<button class="btn" onclick="document.getElementById(\'cfm\').remove();replace(\'roomForm\',{houseId:\''+houseId+'\'})">Thêm mới</button>'+
    '<button class="btn orange" onclick="document.getElementById(\'cfm\').remove();replace(\'roomForm\',{houseId:\''+houseId+'\',copyFrom:\''+roomId+'\'})">Thêm từ bản sao</button>'+
    '<button class="btn gray" onclick="document.getElementById(\'cfm\').remove();replace(\'roomDetail\',{id:\''+roomId+'\'})">Bỏ qua</button></div>';
  document.body.appendChild(m);
}
function doDeleteRoom(id){
  deleteRec('rooms', id).then(function(){ toast('Đã xóa phòng'); replace('houses'); }).catch(errToast);
}

/* ================================================================
   7) CHI TIẾT PHÒNG
   ================================================================ */
VIEWS.roomDetail = function(p){
  var r = byId(db.rooms, p.id); if(!r) return VIEWS.houses(p);
  var st = roomStatus(r);
  var c = activeContract(r.id);
  var assets = db.assets.filter(function(a){ return a.roomId===r.id; });
  var h = '<div class="card static"><div class="row"><h3>'+esc(r.name)+'</h3>'+statusBadge(st)+'</div>'+
    '<div class="kv"><span>Nhà</span><span>'+esc(houseName(r.houseId))+'</span></div>'+
    '<div class="kv"><span>Tầng / Diện tích</span><span>Tầng '+r.floor+' • '+r.area+'m2</span></div>'+
    '<div class="kv"><span>Loại phòng</span><span>'+esc(r.type)+'</span></div>'+
    '<div class="kv"><span>Vệ sinh</span><span>'+esc(r.toilet)+'</span></div>'+
    '<div class="kv"><span>Chung chủ</span><span>'+(r.withOwner?'Có':'Không')+'</span></div>'+
    '<div class="kv"><span>Giá phòng</span><span>'+fmt(r.price)+'</span></div>'+
    '<div class="kv"><span>Cọc tối thiểu</span><span>'+fmt(r.minDeposit)+'</span></div>'+
    '<div class="kv"><span>Số người tối đa</span><span>'+r.maxPeople+' người</span></div>'+
    '<div class="kv"><span>Thanh toán</span><span>'+r.payMonths+' tháng/lần, ngày '+r.payFromDay+'–'+r.payToDay+'</span></div>'+
    '<div class="kv"><span>Tiện ích</span><span>'+esc((r.amenities||[]).join(', ')||'—')+'</span></div></div>';
  if(c){
    var kh = byId(db.customers, c.customerId);
    h += '<div class="card static"><b>Khách đang thuê</b><div class="kv"><span>Người đại diện</span><span>'+esc(kh? kh.name:'')+'</span></div>'+
      '<div class="kv"><span>SĐT</span><span>'+esc(kh? kh.phone:'')+'</span></div>'+
      '<div class="kv"><span>Thời hạn</span><span>'+fmtDate(c.startDate)+' – '+fmtDate(c.endDate)+'</span></div>'+
      '<button class="btn sm" onclick="show(\'contractDetail\',{id:\''+c.id+'\'})">Xem hợp đồng</button></div>';
  }
  var dep = db.deposits.filter(function(d){ return d.roomId===r.id; })[0];
  if(dep && !c) h += '<div class="card static"><b>Thông tin đặt cọc</b><div class="kv"><span>Khách cọc</span><span>'+esc(dep.customerName)+'</span></div><div class="kv"><span>SĐT</span><span>'+esc(dep.phone)+'</span></div><div class="kv"><span>Số tiền</span><span>'+fmt(dep.amount)+'</span></div><div class="kv"><span>Ngày cọc</span><span>'+fmtDate(dep.date)+'</span></div></div>';
  h += '<div class="card static"><b>Tài sản của phòng</b>';
  if(!assets.length) h += '<div class="sub">Chưa có tài sản</div>';
  assets.forEach(function(a){ h += '<div class="kv"><span>'+esc(a.code)+' — '+esc(a.type)+'</span><span>'+esc(a.status)+'</span></div>'; });
  h += '</div>';
  var sv = r.services||{};
  h += '<div class="card static"><b>Dịch vụ của phòng</b>'+
    '<div class="kv"><span>Điện</span><span>'+fmt(sv.dien)+'/số</span></div>'+
    '<div class="kv"><span>Điện chung</span><span>'+fmt(sv.dienChung)+'/người</span></div>'+
    '<div class="kv"><span>Internet</span><span>'+fmt(sv.internet)+'/người</span></div>';
  (sv.extra||[]).forEach(function(s){ h += '<div class="kv"><span>'+esc(s.name)+'</span><span>'+fmt(s.price)+'/'+esc(s.unit)+'</span></div>'; });
  h += '</div>';
  h += '<div class="btnrow">'+
    (st==='empty'? '<button class="btn green" onclick="show(\'contractForm\',{houseId:\''+r.houseId+'\',roomId:\''+r.id+'\'})">Tạo hợp đồng</button>':'')+
    (st==='rented'? '<button class="btn" onclick="show(\'meter\',{type:\'dien\',roomId:\''+r.id+'\'})">Chốt số điện</button><button class="btn" onclick="show(\'meter\',{type:\'nuoc\',roomId:\''+r.id+'\'})">Chốt số nước</button>':'')+
    '</div>';
  if(st==='rented') h += '<button class="btn orange" onclick="show(\'invoiceMonthlyForm\',{roomId:\''+r.id+'\'})">Tạo hóa đơn tháng</button>';
  h += '<button class="btn gray" onclick="show(\'roomForm\',{id:\''+r.id+'\'})">Sửa phòng</button>';
  return { title: r.name, html:h };
};
/* ================================================================
   8) KHÁCH HÀNG — danh sách / chi tiết / form
   ================================================================ */
VIEWS.customers = function(){
  var h = '';
  if(!db.customers.length) h += '<div class="empty-note">Chưa có khách hàng</div>';
  db.customers.forEach(function(k){
    var c = db.contracts.filter(function(x){ return x.customerId===k.id && x.status==='active'; })[0];
    h += '<div class="card" onclick="show(\'customerDetail\',{id:\''+k.id+'\'})"><h3>'+esc(k.name)+'</h3>'+
      '<div class="sub">SĐT: '+esc(k.phone)+(c? ' • Đang ở: '+esc(roomName(c.roomId))+' — '+esc(houseName(c.houseId)) : ' • Chưa có hợp đồng')+'</div></div>';
  });
  h += fabBtn("show('customerForm')");
  return { title:'Danh sách khách hàng', html:h };
};
VIEWS.customerDetail = function(p){
  var k = byId(db.customers, p.id); if(!k) return VIEWS.customers(p);
  var h = '<div class="card static"><h3>'+esc(k.name)+'</h3>'+
    '<div class="kv"><span>Ngày sinh</span><span>'+fmtDate(k.dob)+'</span></div>'+
    '<div class="kv"><span>SĐT</span><span>'+esc(k.phone)+'</span></div>'+
    '<div class="kv"><span>Giới tính</span><span>'+esc(k.gender)+'</span></div>'+
    '<div class="kv"><span>Email</span><span>'+esc(k.email)+'</span></div>'+
    '<div class="kv"><span>CMND/CCCD</span><span>'+esc(k.idCard)+'</span></div></div>';
  var list = db.contracts.filter(function(x){ return x.customerId===k.id; });
  h += '<div class="secttl">Hợp đồng của khách</div>';
  if(!list.length) h += '<div class="empty-note">Chưa có hợp đồng</div>';
  list.forEach(function(c){
    var sv = c.services||{};
    h += '<div class="card" onclick="show(\'contractDetail\',{id:\''+c.id+'\'})"><div class="row"><h3>'+esc(roomName(c.roomId))+'</h3><span class="badge '+(c.status==='active'?'b-rented':'b-gray')+'">'+(c.status==='active'?'Đang hiệu lực':'Đã thanh lý')+'</span></div>'+
      '<div class="sub">'+esc(houseName(c.houseId))+'<br>Giá thuê: '+fmt(c.price)+' • Cọc: '+fmt(c.deposit)+' • Số người: '+c.people+
      '<br>Giá điện: '+fmt((sv.dien||{}).price)+'/số • Giá nước: '+fmt((sv.nuoc||{}).price)+'/'+(((sv.nuoc||{}).unit)==='so'?'số':'người')+
      '<br>Thời gian: '+fmtDate(c.startDate)+' – '+fmtDate(c.endDate)+'</div></div>';
  });
  h += '<button class="btn gray" onclick="show(\'customerForm\',{id:\''+k.id+'\'})">Sửa thông tin khách</button>';
  return { title:'Chi tiết khách hàng', html:h };
};
VIEWS.customerForm = function(p){
  var k = p.id? byId(db.customers, p.id) : {name:'',dob:'',phone:'',gender:'Nam',email:'',idCard:''};
  var h = '<div class="card static">'+
    fld('Họ tên', inp('k_name', k.name), true)+
    fld('Ngày sinh', inpDate('k_dob', k.dob))+
    fld('SĐT', inp('k_phone', k.phone), true)+
    fld('Giới tính', sel('k_gender', ['Nam','Nữ'], k.gender))+
    fld('Email', inp('k_email', k.email))+
    fld('CMND/CCCD', inp('k_idCard', k.idCard))+
    '<button class="btn" onclick="saveCustomer(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm khách hàng')+'</button>'+
    (p.id? delBtn('doDeleteCustomer', p.id):'')+'</div>';
  return { title: p.id? 'Sửa khách hàng':'Thêm khách hàng', html:h };
};
function saveCustomer(id){
  var name = val('k_name'); if(!name){ toast('Vui lòng nhập họ tên'); return; }
  var data = { name:name, dob: val('k_dob')||null, phone: val('k_phone'), gender: val('k_gender'), email: val('k_email'), idCard: val('k_idCard') };
  var pr = id? updateRec('customers', id, data) : createRec('customers', data);
  pr.then(function(){ toast('Đã lưu khách hàng'); goBack(); }).catch(errToast);
}
function doDeleteCustomer(id){ deleteRec('customers', id).then(function(){ toast('Đã xóa khách'); replace('customers'); }).catch(errToast); }

/* ================================================================
   9) HỢP ĐỒNG — danh sách theo nhà + tab lọc
   ================================================================ */
VIEWS.contracts = function(p){
  var houseId = p.houseId || (db.houses[0]||{}).id;
  var tab = p.tab || 'all';
  var h = '<div class="card static">'+ fld('Chọn nhà', houseSel('ct_house', houseId)) +
    '<button class="btn sm" onclick="replace(\'contracts\',{houseId:val(\'ct_house\'),tab:\''+tab+'\'})">Xem</button></div>';
  h += '<div class="tabs">'+
    '<div class="tab'+(tab==='all'?' on':'')+'" onclick="replace(\'contracts\',{houseId:\''+houseId+'\',tab:\'all\'})">Tất cả</div>'+
    '<div class="tab'+(tab==='signed'?' on':'')+'" onclick="replace(\'contracts\',{houseId:\''+houseId+'\',tab:\'signed\'})">Đã ký HĐ</div>'+
    '<div class="tab'+(tab==='unsigned'?' on':'')+'" onclick="replace(\'contracts\',{houseId:\''+houseId+'\',tab:\'unsigned\'})">Chưa ký HĐ</div>'+
    '<div class="tab'+(tab==='expiring'?' on':'')+'" onclick="replace(\'contracts\',{houseId:\''+houseId+'\',tab:\'expiring\'})">Sắp hết hạn</div></div>';
  var rooms = db.rooms.filter(function(r){ return r.houseId===houseId; });
  rooms.forEach(function(r){
    var c = activeContract(r.id);
    var isExp = c && c.endDate >= today() && diffDays(today(), c.endDate) <= 30;
    var showIt = tab==='all' || (tab==='signed' && c) || (tab==='unsigned' && !c) || (tab==='expiring' && isExp);
    if(!showIt) return;
    if(!c){
      h += '<div class="card static"><div class="row"><h3>'+esc(r.name)+'</h3><span class="badge b-empty">Trống</span></div>'+
        '<div class="sub">Phòng trống — chưa ký hợp đồng</div>'+
        '<button class="btn sm green" onclick="show(\'contractForm\',{houseId:\''+houseId+'\',roomId:\''+r.id+'\'})">Tạo hợp đồng</button></div>';
    } else {
      var kh = byId(db.customers, c.customerId);
      h += '<div class="card" onclick="show(\'contractDetail\',{id:\''+c.id+'\'})"><div class="row"><h3>'+esc(r.name)+'</h3>'+(isExp?'<span class="badge b-deposited">Sắp hết hạn</span>':'<span class="badge b-rented">Đã ký HĐ</span>')+'</div>'+
        '<div class="sub">Người đại diện: '+esc(kh? kh.name:'')+' — '+esc(kh? kh.phone:'')+
        '<br>Giá thuê: '+fmt(c.price)+' • Số người: '+c.people+
        '<br>Thời gian: '+fmtDate(c.startDate)+' đến '+fmtDate(c.endDate)+'</div></div>';
    }
  });
  return { title:'Danh sách hợp đồng', html:h };
};

/* ================================================================
   10) TẠO HỢP ĐỒNG — form đầy đủ theo thiết kế
   ================================================================ */
VIEWS.contractForm = function(p){
  var room = p.roomId? byId(db.rooms, p.roomId) : null;
  var houseId = p.houseId || (room? room.houseId : (db.houses[0]||{}).id);
  var emptyRooms = db.rooms.filter(function(r){ return r.houseId===houseId && !activeContract(r.id); });
  var selRoom = room || emptyRooms[0] || {};
  var sv = selRoom.services || {dien:3000, dienChung:30000, internet:50000};
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('ct2_house', houseId))+
    fld('Phòng trống', sel('ct2_room', emptyRooms.map(function(r){ return [r.id, r.name + ' — ' + fmt(r.price)]; }), selRoom.id||''), true)+
    '<div class="secttl">Người đại diện</div>'+
    fld('Họ tên', inp('ct_name', '', 'Nguyễn Văn A'), true)+
    fld('Ngày sinh', inpDate('ct_dob', ''))+
    fld('SĐT', inp('ct_phone', ''), true)+
    fld('Giới tính', sel('ct_gender', ['Nam','Nữ'], 'Nam'))+
    fld('Email', inp('ct_email', ''))+
    fld('CMND/CCCD', inp('ct_idCard', ''))+
    fld('Ngày ký hợp đồng', inpDate('ct_sign', today()))+
    '<div class="row"><div style="flex:1">'+fld('Thời gian thuê từ', inpDate('ct_start', today()), true)+'</div><div style="flex:1">'+fld('đến', inpDate('ct_end', ''), true)+'</div></div>'+
    fld('Giá phòng (vnđ)', inpNum('ct_price', selRoom.price||''), true)+
    fld('Cọc (vnđ)', inpNum('ct_deposit', selRoom.minDeposit||''), true)+
    fld('Số người ở', inpNum('ct_people', 1), true)+
    fld('Số tháng thanh toán 1 lần', inpNum('ct_payMonths', selRoom.payMonths||1), true)+
    '<div class="row"><div style="flex:1">'+fld('Thanh toán từ ngày', inpNum('ct_payFrom', selRoom.payFromDay||1))+'</div><div style="flex:1">'+fld('đến ngày', inpNum('ct_payTo', selRoom.payToDay||3))+'</div></div>'+
    '<div class="secttl">Dịch vụ</div>'+
    fld('Giá điện (vnđ/số)', inpNum('ct_dien', sv.dien))+
    '<div class="row"><div style="flex:1">'+fld('Giá nước (vnđ)', inpNum('ct_nuoc', 80000))+'</div><div style="flex:1">'+fld('Đơn vị nước', sel('ct_nuocUnit', [['nguoi','người'],['so','số']], 'nguoi'))+'</div></div>'+
    fld('Điện chung (vnđ/người)', inpNum('ct_dienChung', sv.dienChung))+
    fld('Vệ sinh (vnđ/người)', inpNum('ct_vesinh', 20000))+
    fld('Internet (vnđ/người)', inpNum('ct_internet', sv.internet))+
    '<div class="row"><div style="flex:1">'+fld('Xe máy — số lượng', inpNum('ct_xmCount', 0))+'</div><div style="flex:1">'+fld('Phí/xe', inpNum('ct_xmFee', 30000))+'</div></div>'+
    '<div class="row"><div style="flex:1">'+fld('Ô tô — số lượng', inpNum('ct_otCount', 0))+'</div><div style="flex:1">'+fld('Phí/xe', inpNum('ct_otFee', 100000))+'</div></div>'+
    '<div class="row"><div style="flex:1">'+fld('Xe đạp — số lượng', inpNum('ct_xdCount', 0))+'</div><div style="flex:1">'+fld('Phí/xe', inpNum('ct_xdFee', 10000))+'</div></div>'+
    '<button class="btn green" onclick="saveContract()">Đăng ký</button></div>';
  return { title:'Tạo hợp đồng', html:h, after:function(){
    var hs = document.getElementById('ct2_house');
    if(hs) hs.onchange = function(){ replace('contractForm', {houseId: hs.value}); };
  }};
};
function saveContract(){
  var roomId = val('ct2_room'); if(!roomId){ toast('Nhà này không còn phòng trống'); return; }
  var name = val('ct_name'), phone = val('ct_phone');
  if(!name || !phone){ toast('Vui lòng nhập họ tên và SĐT người đại diện'); return; }
  if(!val('ct_end')){ toast('Vui lòng chọn ngày kết thúc thuê'); return; }
  var room = byId(db.rooms, roomId);
  var existed = db.customers.filter(function(k){ return k.phone === phone; })[0];
  var custPromise = existed? Promise.resolve(existed) : createRec('customers', {
    name:name, dob: val('ct_dob')||null, phone:phone, gender: val('ct_gender'), email: val('ct_email'), idCard: val('ct_idCard') });
  custPromise.then(function(kh){
    return createRec('contracts', {
      houseId: room.houseId, roomId: roomId, customerId: kh.id,
      signDate: val('ct_sign')||today(), startDate: val('ct_start')||today(), endDate: val('ct_end'),
      price: num(val('ct_price')), deposit: num(val('ct_deposit')), people: num(val('ct_people'))||1,
      payMonths: num(val('ct_payMonths'))||1, payFromDay: num(val('ct_payFrom')), payToDay: num(val('ct_payTo')),
      services: {
        dien:{price:num(val('ct_dien')), unit:'so'},
        nuoc:{price:num(val('ct_nuoc')), unit:val('ct_nuocUnit')},
        dienChung:{price:num(val('ct_dienChung'))}, vesinh:{price:num(val('ct_vesinh'))}, internet:{price:num(val('ct_internet'))},
        xeMay:{count:num(val('ct_xmCount')), fee:num(val('ct_xmFee'))},
        oTo:{count:num(val('ct_otCount')), fee:num(val('ct_otFee'))},
        xeDap:{count:num(val('ct_xdCount')), fee:num(val('ct_xdFee'))}
      }, status:'active' });
  }).then(function(c){ toast('Đã tạo hợp đồng'); replace('contractDetail', {id:c.id}); }).catch(errToast);
}

/* ================================================================
   11) CHI TIẾT HỢP ĐỒNG
   ================================================================ */
VIEWS.contractDetail = function(p){
  var c = byId(db.contracts, p.id); if(!c) return VIEWS.contracts(p);
  var kh = byId(db.customers, c.customerId);
  var sv = c.services||{};
  function svcRow(lbl, s, suffix){ return '<div class="kv"><span>'+lbl+'</span><span>'+fmt((s||{}).price)+'/'+suffix+'</span></div>'; }
  var h = '<div class="card static"><div class="row"><h3>'+esc(roomName(c.roomId))+'</h3><span class="badge '+(c.status==='active'?'b-rented':'b-gray')+'">'+(c.status==='active'?'Đang hiệu lực':'Đã thanh lý')+'</span></div>'+
    '<div class="sub">'+esc(houseName(c.houseId))+'</div>'+
    '<div class="kv"><span>Giá phòng</span><span>'+fmt(c.price)+'</span></div>'+
    '<div class="kv"><span>Cọc</span><span>'+fmt(c.deposit)+'</span></div>'+
    '<div class="kv"><span>Số người</span><span>'+c.people+'</span></div>'+
    svcRow('Giá điện', sv.dien, 'số') + svcRow('Giá nước', sv.nuoc, (sv.nuoc||{}).unit==='so'?'số':'người') +
    svcRow('Điện chung', sv.dienChung, 'người') + svcRow('Vệ sinh', sv.vesinh, 'người') + svcRow('Internet', sv.internet, 'người')+
    '<div class="kv"><span>Xe máy</span><span>'+((sv.xeMay||{}).count||0)+' xe × '+fmt((sv.xeMay||{}).fee)+'</span></div>'+
    '<div class="kv"><span>Ô tô</span><span>'+((sv.oTo||{}).count||0)+' xe × '+fmt((sv.oTo||{}).fee)+'</span></div>'+
    '<div class="kv"><span>Xe đạp</span><span>'+((sv.xeDap||{}).count||0)+' xe × '+fmt((sv.xeDap||{}).fee)+'</span></div>'+
    '<div class="kv"><span>Ngày ký</span><span>'+fmtDate(c.signDate)+'</span></div>'+
    '<div class="kv"><span>Thời gian thuê</span><span>'+fmtDate(c.startDate)+' đến '+fmtDate(c.endDate)+'</span></div>'+
    '<div class="kv"><span>Số tháng thanh toán 1 lần</span><span>'+c.payMonths+'</span></div>'+
    '<div class="kv"><span>Thời gian thanh toán</span><span>từ ngày '+c.payFromDay+' đến ngày '+c.payToDay+'</span></div></div>';
  if(kh) h += '<div class="card" onclick="show(\'customerDetail\',{id:\''+kh.id+'\'})"><b>Khách hàng (người đại diện)</b><div class="sub">'+esc(kh.name)+' — '+esc(kh.phone)+'</div></div>';
  if(c.status==='active'){
    h += '<div class="btnrow"><button class="btn" onclick="show(\'invoiceMonthlyForm\',{roomId:\''+c.roomId+'\'})">Tạo hóa đơn tháng</button>'+
      '<button class="btn orange" onclick="show(\'liquidate1\',{id:\''+c.id+'\'})">Thanh lý hợp đồng</button></div>';
  }
  return { title:'Chi tiết hợp đồng', html:h };
};
/* ================================================================
   12) THANH LÝ HỢP ĐỒNG — Bước 1 chốt công tơ, Bước 2 tổng hợp (API tính)
   ================================================================ */
var LIQ = null; // dữ liệu tạm giữa 2 bước thanh lý
VIEWS.liquidate1 = function(p){
  var c = byId(db.contracts, p.id); if(!c) return VIEWS.contracts(p);
  var ld = lastReading(c.roomId, 'dien'), ln = lastReading(c.roomId, 'nuoc');
  var h = '<div class="card static"><h3>Thanh lý hợp đồng — Chốt công tơ</h3>'+
    '<div class="sub">'+esc(houseName(c.houseId))+' • '+esc(roomName(c.roomId))+'</div>'+
    fld('Điện — chỉ số cuối (chỉ số đầu: '+(ld? ld.current : 0)+')', inpNum('lq_dien', ld? ld.current : ''), true)+
    fld('Nước — chỉ số cuối (chỉ số đầu: '+(ln? ln.current : 0)+')', inpNum('lq_nuoc', ln? ln.current : ''))+
    fld('Ngày thanh lý', inpDate('lq_date', today()), true)+
    '<label class="chk"><input type="checkbox" id="lq_refund" checked> Hoàn tiền phòng thừa cho khách</label>'+
    fld('Tiền phòng thừa (vnđ)', inpNum('lq_prepaid', 0))+
    '<button class="btn" onclick="gotoLiquidate2(\''+c.id+'\')">Tạo hóa đơn thanh lý</button></div>';
  return { title:'Thanh lý hợp đồng', html:h };
};
function gotoLiquidate2(contractId){
  LIQ = { contractId: contractId, dienFinal: val('lq_dien')===''? null : num(val('lq_dien')),
    nuocFinal: val('lq_nuoc')===''? null : num(val('lq_nuoc')), liquidateDate: val('lq_date')||today(),
    refundRoomFee: document.getElementById('lq_refund').checked, prepaidRoomFee: num(val('lq_prepaid')) };
  show('liquidate2', {id: contractId});
}
VIEWS.liquidate2 = function(p){
  var c = byId(db.contracts, p.id); if(!c) return VIEWS.contracts(p);
  var h = '<div id="liqBody"><div class="loading">Đang tính toán...</div></div>';
  return { title:'Thanh lý hợp đồng', html:h, after:function(){
    api('/contracts/' + c.id + '/liquidate', 'POST', Object.assign({}, LIQ, {confirm:false})).then(function(s){
      var el = document.getElementById('liqBody'); if(!el) return;
      var hh = '<div class="card static"><div class="sub">'+esc(houseName(c.houseId))+' • '+esc(roomName(c.roomId))+' • Ngày thanh lý: '+fmtDate(s.liquidateDate)+' ('+s.days+' ngày ở kỳ cuối)</div>'+
        '<div class="secttl">Tiền khách nợ</div>'+
        '<div class="kv"><span>Tiền phòng ('+s.days+' ngày)</span><span>'+fmt(s.roomOwed)+'</span></div>'+
        '<div class="kv"><span>Tiền dịch vụ</span><span>'+fmt(s.serviceTotal)+'</span></div>';
      (s.lines||[]).forEach(function(l){ hh += '<div class="kv"><span>• '+esc(l.label)+(l.prev!=null? ' ('+l.prev+' → '+l.current+')':'')+' × '+l.qty+'</span><span>'+fmt(l.amount)+'</span></div>'; });
      hh += '<div class="kv"><span><b>Tổng khách nợ</b></span><span><b>'+fmt(s.owedTotal)+'</b></span></div>'+
        '<div class="secttl">Tiền trả khách</div>'+
        '<div class="kv"><span>Tiền cọc</span><span>'+fmt(s.deposit)+'</span></div>'+
        '<div class="kv"><span>Tiền phòng thừa</span><span>'+fmt(s.prepaidRoomFee)+'</span></div>'+
        '<div class="kv"><span><b>Tổng trả khách</b></span><span><b>'+fmt(s.returnTotal)+'</b></span></div>'+
        '<div class="secttl">Tổng hợp</div>';
      if(s.result==='collect') hh += '<div class="card static" style="background:#ffebee">Bạn cần <b>thu thêm của khách '+fmt(s.net)+'</b> (sẽ tạo hóa đơn/phiếu thu)</div>';
      else if(s.result==='refund') hh += '<div class="card static" style="background:#e8f5e9">Bạn phải <b>trả khách '+fmt(-s.net)+'</b> (sẽ tạo phiếu chi)</div>';
      else hh += '<div class="card static">Khách nợ và tiền trả khách cân bằng — không phát sinh thu/chi.</div>';
      hh += '<button class="btn green" onclick="confirmLiquidate(\''+c.id+'\')">Hoàn tất thanh lý</button></div>';
      el.innerHTML = hh;
    }).catch(function(e){ var el = document.getElementById('liqBody'); if(el) el.innerHTML = '<div class="empty-note">Lỗi: '+esc(e.message)+'</div>'; });
  }};
};
function confirmLiquidate(contractId){
  api('/contracts/' + contractId + '/liquidate', 'POST', Object.assign({}, LIQ, {confirm:true})).then(function(){
    return Promise.all([loadColl('contracts'), loadColl('invoices'), loadColl('expenses'), loadColl('meterReadings')]);
  }).then(function(){ toast('Đã thanh lý hợp đồng'); replace('contractDetail', {id: contractId}); }).catch(errToast);
}

/* ================================================================
   13) CHỐT SỐ ĐIỆN / NƯỚC + LỊCH SỬ CHỐT
   ================================================================ */
VIEWS.meter = function(p){
  var type = p.type || 'dien';
  var label = type==='dien'? 'Điện' : 'Nước';
  var h = '<div class="tabs"><div class="tab'+(type==='dien'?' on':'')+'" onclick="replace(\'meter\',{type:\'dien\'})">Điện</div>'+
    '<div class="tab'+(type==='nuoc'?' on':'')+'" onclick="replace(\'meter\',{type:\'nuoc\'})">Nước</div></div>';
  var rented = db.rooms.filter(function(r){ return activeContract(r.id); });
  if(p.roomId) rented = rented.filter(function(r){ return r.id===p.roomId; });
  if(!rented.length) h += '<div class="empty-note">Chưa có phòng nào đang thuê</div>';
  rented.forEach(function(r){
    var lr = lastReading(r.id, type);
    h += '<div class="card static"><div class="row"><h3>'+esc(r.name)+'</h3><button class="btn sm gray" onclick="show(\'meterHistory\',{roomId:\''+r.id+'\',type:\''+type+'\'})">Lịch sử</button></div>'+
      '<div class="sub">'+esc(houseName(r.houseId))+' • Chỉ số '+label.toLowerCase()+' kỳ trước: <b>'+(lr? lr.current : 0)+'</b>'+(lr? ' ('+fmtDate(lr.date)+')':'')+'</div>'+
      '<div class="row" style="margin-top:8px"><input type="number" id="mr_'+r.id+'" placeholder="Nhập chỉ số mới" style="flex:1"><button class="btn sm" onclick="saveMeter(\''+r.id+'\',\''+type+'\')">Chốt số</button></div></div>';
  });
  return { title:'Chốt số ' + label.toLowerCase(), html:h };
};
function saveMeter(roomId, type){
  var v = val('mr_' + roomId); if(v===''){ toast('Vui lòng nhập chỉ số mới'); return; }
  var r = byId(db.rooms, roomId);
  var lr = lastReading(roomId, type);
  createRec('meterReadings', { houseId: r.houseId, roomId: roomId, type: type, prev: lr? lr.current : 0, current: num(v), date: today(), note:'' })
    .then(function(){ toast('Đã chốt số'); replace('meter', {type:type, roomId: curParams.roomId||undefined}); }).catch(errToast);
}
VIEWS.meterHistory = function(p){
  var r = byId(db.rooms, p.roomId); if(!r) return VIEWS.houses(p);
  var type = p.type || 'dien';
  var label = type==='dien'? 'điện' : 'nước';
  var list = db.meterReadings.filter(function(m){ return m.roomId===r.id && m.type===type; });
  list.sort(function(a,b){ return (a.date||'') < (b.date||'') ? 1 : -1; });
  var h = '';
  if(!list.length) h += '<div class="empty-note">Chưa có lần chốt nào</div>';
  list.forEach(function(m){
    h += '<div class="card static"><div class="row"><h3>'+fmtDate(m.date)+'</h3><span class="badge b-fixing">Dùng: '+(m.current - m.prev)+' số</span></div>'+
      '<div class="kv"><span>Chỉ số đầu</span><span>'+m.prev+'</span></div>'+
      '<div class="kv"><span>Chỉ số cuối</span><span>'+m.current+'</span></div>'+
      (m.note? '<div class="sub">'+esc(m.note)+'</div>':'')+
      '<button class="btn sm red" onclick="confirmBox(\'Xóa lần chốt này?\',\'doDeleteMeter\',\''+m.id+'\')">Xóa lần chốt</button></div>';
  });
  return { title:'Lịch sử chốt '+label+' — '+r.name, html:h };
};
function doDeleteMeter(id){ deleteRec('meterReadings', id).then(function(){ toast('Đã xóa'); goBack(); render(); }).catch(errToast); }

/* ================================================================
   14+16) HÓA ĐƠN — danh sách + chi tiết + thanh toán + sửa
   ================================================================ */
function invoiceCard(i){
  return '<div class="card" onclick="show(\'invoiceDetail\',{id:\''+i.id+'\'})"><div class="row"><h3>'+esc(roomName(i.roomId)||'Cả nhà')+'</h3>'+
    '<span class="badge '+(i.status==='paid'?'b-paid':'b-unpaid')+'">'+(i.status==='paid'?'Đã thanh toán':'Chưa thanh toán')+'</span></div>'+
    '<div class="sub">'+esc(houseName(i.houseId))+' • '+(i.kind==='monthly'? monthLabel(i.month||'') : 'Hóa đơn khác: '+esc(i.reason||''))+
    '<br>Ngày tạo: '+fmtDate(i.createdDate)+'</div><div class="row"><span></span><span class="price">'+fmt(i.total)+'</span></div></div>';
}
VIEWS.invoices = function(p){
  var f = { houseId: p.houseId||'', status: p.status||'' };
  var h = '<div class="card static"><div class="row"><div style="flex:1">'+fld('Nhà', houseSel('iv_house', f.houseId, 'Tất cả nhà'))+'</div><div style="flex:1">'+
    fld('Trạng thái', sel('iv_status', [['','Tất cả'],['unpaid','Chưa thanh toán'],['paid','Đã thanh toán']], f.status))+'</div></div>'+
    '<button class="btn sm" onclick="replace(\'invoices\',{houseId:val(\'iv_house\'),status:val(\'iv_status\')})">Lọc</button> '+
    '<button class="btn sm orange" onclick="show(\'invoiceMonthlyForm\')">+ Hóa đơn tháng</button> '+
    '<button class="btn sm green" onclick="show(\'invoiceOtherForm\')">+ Hóa đơn khác</button></div>';
  var list = db.invoices.filter(function(i){ return (!f.houseId||i.houseId===f.houseId) && (!f.status||i.status===f.status); });
  if(!list.length) h += '<div class="empty-note">Chưa có hóa đơn nào</div>';
  list.forEach(function(i){ h += invoiceCard(i); });
  return { title:'Danh sách hóa đơn', html:h };
};
VIEWS.invoiceDetail = function(p){
  var i = byId(db.invoices, p.id); if(!i) return VIEWS.invoices(p);
  var h = '<div class="card static"><div class="row"><h3>'+esc(roomName(i.roomId)||'Cả nhà')+'</h3>'+
    '<span class="badge '+(i.status==='paid'?'b-paid':'b-unpaid')+'">'+(i.status==='paid'?'Đã thanh toán':'Chưa thanh toán')+'</span></div>'+
    '<div class="sub">'+esc(houseName(i.houseId))+' • '+(i.kind==='monthly'? monthLabel(i.month||'') : 'Hóa đơn khác — '+esc(i.reason||''))+'</div>'+
    (i.kind==='monthly'? '<div class="kv"><span>Tiền phòng</span><span>'+fmt(i.roomFee)+'</span></div>':'')+
    '<div class="secttl">Tiền dịch vụ</div><table><tr><th>Hạng mục</th><th>Đơn giá</th><th>Đầu</th><th>Cuối</th><th>SL</th><th>Thành tiền</th></tr>';
  (i.lines||[]).forEach(function(l){
    h += '<tr><td>'+esc(l.label)+'</td><td>'+fmt(l.unitPrice)+(l.unit? '/'+esc(l.unit):'')+'</td><td>'+(l.prev==null?'—':l.prev)+'</td><td>'+(l.current==null?'—':l.current)+'</td><td>'+l.qty+'</td><td>'+fmt(l.amount)+'</td></tr>';
  });
  var svcTotal = (i.lines||[]).reduce(function(s,l){ return s + (l.amount||0); }, 0);
  h += '</table><div class="kv"><span>Tổng tiền dịch vụ</span><span>'+fmt(svcTotal)+'</span></div>'+
    '<div class="kv"><span><b>Tổng cộng</b></span><span><b>'+fmt(i.total)+'</b></span></div></div>';
  if(i.status==='unpaid') h += '<button class="btn green" onclick="payInvoice(\''+i.id+'\')">Thanh toán</button>';
  h += '<button class="btn" onclick="show(\'invoiceEdit\',{id:\''+i.id+'\'})">Chỉnh sửa</button>';
  if(i.status==='unpaid') h += delBtn('doDeleteInvoice', i.id);
  return { title:'Chi tiết hóa đơn', html:h };
};
function payInvoice(id){ updateRec('invoices', id, {status:'paid'}).then(function(){ toast('Đã thanh toán'); render(); }).catch(errToast); }
function doDeleteInvoice(id){ deleteRec('invoices', id).then(function(){ toast('Đã xóa hóa đơn'); replace('invoices'); }).catch(errToast); }
VIEWS.invoiceEdit = function(p){
  var i = byId(db.invoices, p.id); if(!i) return VIEWS.invoices(p);
  var h = '<div class="card static"><h3>'+(i.kind==='monthly'?'Chỉnh sửa hóa đơn tháng':'Chỉnh sửa hóa đơn khác')+'</h3>'+
    '<div class="sub">'+esc(houseName(i.houseId))+' • '+esc(roomName(i.roomId)||'')+'</div>';
  if(i.kind==='other') h += fld('Lý do thu', inp('ie_reason', i.reason||''));
  if(i.kind==='monthly') h += fld('Tiền phòng (vnđ)', inpNum('ie_roomFee', i.roomFee));
  h += '<div class="secttl">Các dòng dịch vụ</div><div id="ieLines">';
  (i.lines||[]).forEach(function(l, idx){
    h += '<div class="row ie-line" style="margin-bottom:6px"><input class="l-label" value="'+esc(l.label)+'" placeholder="Hạng mục" style="flex:1.3">'+
      '<input class="l-price" type="number" value="'+l.unitPrice+'" placeholder="Đơn giá" style="flex:1">'+
      '<input class="l-qty" type="number" value="'+l.qty+'" placeholder="SL" style="flex:.6">'+
      '<input class="l-prev" type="number" value="'+(l.prev==null?'':l.prev)+'" placeholder="Đầu" style="flex:.6">'+
      '<input class="l-curr" type="number" value="'+(l.current==null?'':l.current)+'" placeholder="Cuối" style="flex:.6">'+
      '<button class="btn sm red" onclick="this.parentNode.remove()">×</button></div>';
  });
  h += '</div><button class="btn sm gray" onclick="addIeLine()">+ Thêm dòng</button>'+
    fld('Trạng thái', sel('ie_status', [['unpaid','Chưa thanh toán'],['paid','Đã thanh toán']], i.status))+
    '<button class="btn" onclick="saveInvoiceEdit(\''+i.id+'\',\''+i.kind+'\')">Cập nhật</button></div>';
  return { title:'Chỉnh sửa hóa đơn', html:h };
};
function addIeLine(){
  var d = document.createElement('div'); d.className='row ie-line'; d.style.marginBottom='6px';
  d.innerHTML = '<input class="l-label" placeholder="Hạng mục" style="flex:1.3"><input class="l-price" type="number" placeholder="Đơn giá" style="flex:1"><input class="l-qty" type="number" placeholder="SL" style="flex:.6"><input class="l-prev" type="number" placeholder="Đầu" style="flex:.6"><input class="l-curr" type="number" placeholder="Cuối" style="flex:.6"><button class="btn sm red" onclick="this.parentNode.remove()">×</button>';
  document.getElementById('ieLines').appendChild(d);
}
function saveInvoiceEdit(id, kind){
  var lines = [];
  document.querySelectorAll('.ie-line').forEach(function(row){
    var label = row.querySelector('.l-label').value.trim(); if(!label) return;
    var price = num(row.querySelector('.l-price').value), qty = num(row.querySelector('.l-qty').value);
    var prev = row.querySelector('.l-prev').value, curr = row.querySelector('.l-curr').value;
    lines.push({ label:label, unitPrice:price, unit:'', qty:qty, prev: prev===''? null : num(prev), current: curr===''? null : num(curr), amount: price*qty });
  });
  var data = { lines: lines, status: val('ie_status') };
  if(kind==='monthly') data.roomFee = num(val('ie_roomFee')); else data.reason = val('ie_reason');
  updateRec('invoices', id, data).then(function(){ toast('Đã cập nhật hóa đơn'); goBack(); }).catch(errToast);
}

/* ================================================================
   15) TẠO HÓA ĐƠN HÀNG THÁNG — qua API /invoices/monthly
   ================================================================ */
VIEWS.invoiceMonthlyForm = function(p){
  var rented = db.rooms.filter(function(r){ return activeContract(r.id); });
  var room = p.roomId? byId(db.rooms, p.roomId) : rented[0];
  var c = room? activeContract(room.id) : null;
  var h = '<div class="card static">'+
    fld('Phòng đang thuê', sel('im_room', rented.map(function(r){ return [r.id, r.name + ' — ' + houseName(r.houseId)]; }), room? room.id : ''), true)+
    fld('Tháng (YYYY-MM)', inp('im_month', curMonth()), true);
  if(c){
    var ld = lastReading(room.id, 'dien'), ln = lastReading(room.id, 'nuoc');
    h += '<div class="sub">Giá phòng theo HĐ: <b>'+fmt(c.price)+'</b> • Số người: '+c.people+'</div>'+
      fld('Điện — chỉ số đầu', inpNum('im_dienPrev', ld? ld.prev : 0))+
      fld('Điện — chỉ số cuối', inpNum('im_dienCurr', ld? ld.current : 0))+
      fld('Nước — chỉ số đầu (nếu tính theo số)', inpNum('im_nuocPrev', ln? ln.prev : 0))+
      fld('Nước — chỉ số cuối (nếu tính theo số)', inpNum('im_nuocCurr', ln? ln.current : 0))+
      fld('Số người (cho dòng theo người)', inpNum('im_people', c.people))+
      '<div class="sub">Các dòng Điện chung, Vệ sinh, Internet, Xe được tự tính theo hợp đồng khi bấm Tạo hóa đơn.</div>';
  } else h += '<div class="empty-note">Phòng chưa có hợp đồng</div>';
  h += '<button class="btn" onclick="createMonthlyInvoice()">Tạo hóa đơn</button></div>';
  return { title:'Tạo hóa đơn hàng tháng', html:h, after:function(){
    var s = document.getElementById('im_room');
    if(s) s.onchange = function(){ replace('invoiceMonthlyForm', {roomId: s.value}); };
  }};
};
function createMonthlyInvoice(){
  var roomId = val('im_room'); if(!roomId){ toast('Chưa chọn phòng'); return; }
  var body = { roomId: roomId, month: val('im_month') || curMonth(),
    dienPrev: num(val('im_dienPrev')), dienCurr: num(val('im_dienCurr')),
    nuocPrev: num(val('im_nuocPrev')), nuocCurr: num(val('im_nuocCurr')),
    people: num(val('im_people')) || null };
  api('/invoices/monthly', 'POST', body).then(function(inv){
    db.invoices.push(inv); toast('Đã tạo hóa đơn ' + fmt(inv.total));
    replace('invoiceDetail', {id: inv.id});
  }).catch(errToast);
}

/* ================================================================
   17) TẠO HÓA ĐƠN KHÁC — chọn nhiều phòng, đơn vị người/phòng
   ================================================================ */
VIEWS.invoiceOtherForm = function(p){
  var houseId = p.houseId || (db.houses[0]||{}).id;
  var rooms = db.rooms.filter(function(r){ return r.houseId===houseId; });
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('io_house', houseId))+
    fld('Lý do thu', inp('io_reason', '', 'VD: thu tiền vệ sinh'), true)+
    '<div class="row"><div style="flex:1">'+fld('Số tiền thu (vnđ)', inpNum('io_amount', ''), true)+'</div><div style="flex:1">'+
    fld('Đơn vị', sel('io_unit', [['người','người'],['phòng','phòng']], 'người'))+'</div></div>'+
    fld('Ghi chú', inp('io_note', ''))+
    '<div class="secttl">Chọn phòng nhận hóa đơn</div>'+
    '<div class="btnrow"><button class="btn sm gray" onclick="toggleAllRooms(true)">Tất cả</button><button class="btn sm gray" onclick="toggleAllRooms(false)">Bỏ tất cả</button></div><div style="height:8px"></div>';
  rooms.forEach(function(r, idx){
    var c = activeContract(r.id);
    h += '<label class="chk"><input type="checkbox" class="io-room" value="'+r.id+'" checked> '+(idx+1)+'. '+esc(r.name)+(c? ' ('+c.people+' người)' : '')+'</label>';
  });
  h += '<button class="btn" onclick="createOtherInvoices(false)">Tạo hóa đơn</button>'+
    '<button class="btn green" onclick="createOtherInvoices(true)">Tạo hóa đơn cả nhà</button></div>';
  return { title:'Tạo hóa đơn khác', html:h, after:function(){
    var s = document.getElementById('io_house');
    if(s) s.onchange = function(){ replace('invoiceOtherForm', {houseId: s.value}); };
  }};
};
function toggleAllRooms(on){ document.querySelectorAll('.io-room').forEach(function(cb){ cb.checked = on; }); }
function createOtherInvoices(allHouse){
  var reason = val('io_reason'); if(!reason){ toast('Vui lòng nhập lý do thu'); return; }
  var amount = num(val('io_amount')); if(!amount){ toast('Vui lòng nhập số tiền thu'); return; }
  var unit = val('io_unit'), houseId = val('io_house');
  var roomIds = [];
  document.querySelectorAll('.io-room').forEach(function(cb){ if(allHouse || cb.checked) roomIds.push(cb.value); });
  if(!roomIds.length){ toast('Chưa chọn phòng nào'); return; }
  var jobs = roomIds.map(function(rid){
    var c = activeContract(rid);
    var qty = unit==='người'? (c? c.people : 1) : 1;
    return createRec('invoices', { kind:'other', houseId:houseId, roomId:rid, month:null, roomFee:0,
      reason: reason, status:'unpaid', createdDate: today(),
      lines:[{label:reason, unitPrice:amount, unit:unit, qty:qty, amount:amount*qty}], total: amount*qty });
  });
  Promise.all(jobs).then(function(){ toast('Đã tạo ' + roomIds.length + ' hóa đơn'); replace('invoices', {houseId:houseId}); }).catch(errToast);
}
/* ================================================================
   18) XE — danh sách / form / chi tiết (sửa qua form)
   ================================================================ */
VIEWS.vehicles = function(p){
  var f = p.houseId||'';
  var h = '<div class="card static">'+ fld('Lọc theo nhà', houseSel('vh_house', f, 'Tất cả nhà')) +
    '<button class="btn sm" onclick="replace(\'vehicles\',{houseId:val(\'vh_house\')})">Lọc</button></div>';
  var list = db.vehicles.filter(function(v){ return !f || v.houseId===f; });
  if(!list.length) h += '<div class="empty-note">Chưa có xe nào</div>';
  list.forEach(function(v){
    h += '<div class="card" onclick="show(\'vehicleForm\',{id:\''+v.id+'\'})"><div class="row"><h3>'+esc(v.type)+' — '+esc(v.plate)+'</h3><span class="price">'+fmt(v.fee)+'/tháng</span></div>'+
      '<div class="sub">'+esc(houseName(v.houseId))+' • '+esc(roomName(v.roomId)||'')+' • Chủ xe: '+esc(v.ownerName)+(v.brand? ' • '+esc(v.brand):'')+(v.color? ' • Màu '+esc(v.color):'')+'</div></div>';
  });
  h += fabBtn("show('vehicleForm')");
  return { title:'Danh sách xe', html:h };
};
VIEWS.vehicleForm = function(p){
  var v = p.id? byId(db.vehicles, p.id) : {houseId:(db.houses[0]||{}).id, roomId:'', type:'Xe máy', plate:'', ownerName:'', fee:30000, brand:'', color:''};
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('v_house', v.houseId))+
    fld('Phòng', roomSel('v_room', v.houseId, v.roomId, '-- Cả nhà --'))+
    fld('Loại xe', sel('v_type', ['Xe máy','Ô tô','Xe đạp'], v.type))+
    fld('Nhãn hiệu', inp('v_brand', v.brand, 'VD: Wave RSX'))+
    fld('Màu', inp('v_color', v.color))+
    fld('Biển số', inp('v_plate', v.plate), true)+
    fld('Chủ xe (khách thuê)', inp('v_owner', v.ownerName))+
    fld('Phí gửi xe (vnđ/tháng)', inpNum('v_fee', v.fee))+
    '<button class="btn" onclick="saveVehicle(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm xe')+'</button>'+
    (p.id? delBtn('doDeleteVehicle', p.id):'')+'</div>';
  return { title: p.id? 'Chi tiết xe':'Thêm xe', html:h, after:function(){
    var s = document.getElementById('v_house');
    if(s) s.onchange = function(){ var rs = document.getElementById('v_room'); if(rs){ var wrap = rs.parentNode; wrap.innerHTML = fld('Phòng', roomSel('v_room', s.value, '', '-- Cả nhà --')); } };
  }};
};
function saveVehicle(id){
  var data = { houseId: val('v_house'), roomId: val('v_room')||null, type: val('v_type'), brand: val('v_brand'), color: val('v_color'),
    plate: val('v_plate'), ownerName: val('v_owner'), fee: num(val('v_fee')) };
  var pr = id? updateRec('vehicles', id, data) : createRec('vehicles', data);
  pr.then(function(){ toast('Đã lưu xe'); goBack(); }).catch(errToast);
}
function doDeleteVehicle(id){ deleteRec('vehicles', id).then(function(){ toast('Đã xóa xe'); replace('vehicles'); }).catch(errToast); }

/* ================================================================
   19) TÀI SẢN — tổng quan / thêm / chi tiết-cập nhật
   ================================================================ */
VIEWS.assets = function(p){
  var f = { houseId: p.houseId||'', roomId: p.roomId||'' };
  var counts = {};
  ASSET_STATUS.forEach(function(s){ counts[s]=0; });
  db.assets.forEach(function(a){ counts[a.status] = (counts[a.status]||0)+1; });
  var h = '<div class="secttl">Tổng quan tài sản</div><div class="grid2">';
  ASSET_STATUS.forEach(function(s){ h += '<div class="stat"><div class="num">'+counts[s]+'</div><div class="lbl">'+s+'</div></div>'; });
  h += '</div><div class="card static"><div class="row"><div style="flex:1">'+fld('Nhà', houseSel('as_house', f.houseId, 'Tất cả nhà'))+'</div><div style="flex:1">'+
    fld('Phòng', roomSel('as_room', f.houseId, f.roomId, 'Tất cả phòng'))+'</div></div>'+
    '<button class="btn sm" onclick="replace(\'assets\',{houseId:val(\'as_house\'),roomId:val(\'as_room\')})">Lọc</button></div>';
  var list = db.assets.filter(function(a){ return (!f.houseId||a.houseId===f.houseId) && (!f.roomId||a.roomId===f.roomId); });
  if(!list.length) h += '<div class="empty-note">Chưa có tài sản</div>';
  list.forEach(function(a){
    h += '<div class="card" onclick="show(\'assetForm\',{id:\''+a.id+'\'})"><div class="row"><h3>'+esc(a.type)+'</h3><span class="badge b-gray">'+esc(a.status)+'</span></div>'+
      '<div class="sub">Mã: '+esc(a.code)+' • '+esc(houseName(a.houseId))+(a.roomId? ' • '+esc(roomName(a.roomId)) : ' • Cả nhà')+'</div></div>';
  });
  h += fabBtn("show('assetForm')");
  return { title:'Tài sản', html:h };
};
VIEWS.assetForm = function(p){
  var a = p.id? byId(db.assets, p.id) : {houseId:(db.houses[0]||{}).id, roomId:'', code:'', type:'', status:'Tốt'};
  var h = '<div class="card static">'+
    fld('Địa chỉ (nhà)', houseSel('a_house', a.houseId))+
    fld('Phòng', roomSel('a_room', a.houseId, a.roomId, '-- Cả nhà --'))+
    fld('Mã tài sản', inp('a_code', a.code, 'VD: 00000001'))+
    fld('Loại tài sản', inp('a_type', a.type, 'VD: Nóng lạnh, Điều hòa, Giường...'), true)+
    fld('Trạng thái', sel('a_status', ASSET_STATUS, a.status))+
    '<button class="btn" onclick="saveAsset(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật tài sản':'Thêm tài sản')+'</button>'+
    (p.id? delBtn('doDeleteAsset', p.id):'')+'</div>';
  return { title: p.id? 'Tài sản — Chi tiết':'Thêm tài sản', html:h, after:function(){
    var s = document.getElementById('a_house');
    if(s) s.onchange = function(){ replace('assetForm', {id: p.id||undefined}); var el=document.getElementById('a_house'); if(el) el.value = s.value; };
  }};
};
function saveAsset(id){
  var data = { houseId: val('a_house'), roomId: val('a_room')||null, code: val('a_code'), type: val('a_type'), status: val('a_status') };
  if(!data.type){ toast('Vui lòng nhập loại tài sản'); return; }
  var pr = id? updateRec('assets', id, data) : createRec('assets', data);
  pr.then(function(){ toast('Đã lưu tài sản'); goBack(); }).catch(errToast);
}
function doDeleteAsset(id){ deleteRec('assets', id).then(function(){ toast('Đã xóa tài sản'); replace('assets'); }).catch(errToast); }

/* ================================================================
   20) DỊCH VỤ + ĐƠN VỊ TÍNH
   ================================================================ */
VIEWS.services = function(){
  var h = '';
  if(!db.services.length) h += '<div class="empty-note">Chưa có dịch vụ</div>';
  db.services.forEach(function(s){
    h += '<div class="card" onclick="show(\'serviceForm\',{id:\''+s.id+'\'})"><div class="row"><h3>'+esc(s.name)+'</h3><span class="price">'+fmt(s.price)+'/'+esc(unitName(s.unitId))+'</span></div></div>';
  });
  h += fabBtn("show('serviceForm')");
  return { title:'Danh sách dịch vụ', html:h };
};
VIEWS.serviceForm = function(p){
  var s = p.id? byId(db.services, p.id) : {name:'', price:'', unitId:(db.units[0]||{}).id};
  var h = '<div class="card static">'+
    fld('Tên dịch vụ', inp('sv_name', s.name), true)+
    fld('Giá (vnđ)', inpNum('sv_price', s.price))+
    fld('Đơn vị tính', sel('sv_unit', db.units.map(function(u){ return [u.id, u.name]; }), s.unitId||''))+
    '<button class="btn" onclick="saveService(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm dịch vụ')+'</button>'+
    (p.id? delBtn('doDeleteService', p.id):'')+'</div>';
  return { title: p.id? 'Sửa dịch vụ':'Thêm dịch vụ', html:h };
};
function saveService(id){
  var data = { name: val('sv_name'), price: num(val('sv_price')), unitId: val('sv_unit')||null };
  if(!data.name){ toast('Vui lòng nhập tên dịch vụ'); return; }
  var pr = id? updateRec('services', id, data) : createRec('services', data);
  pr.then(function(){ toast('Đã lưu dịch vụ'); goBack(); }).catch(errToast);
}
function doDeleteService(id){ deleteRec('services', id).then(function(){ toast('Đã xóa dịch vụ'); replace('services'); }).catch(errToast); }
VIEWS.units = function(){
  var h = '';
  if(!db.units.length) h += '<div class="empty-note">Chưa có đơn vị tính</div>';
  db.units.forEach(function(u){
    h += '<div class="card" onclick="show(\'unitForm\',{id:\''+u.id+'\'})"><h3>'+esc(u.name)+'</h3></div>';
  });
  h += fabBtn("show('unitForm')");
  return { title:'Đơn vị tính', html:h };
};
VIEWS.unitForm = function(p){
  var u = p.id? byId(db.units, p.id) : {name:''};
  var h = '<div class="card static">'+ fld('Tên đơn vị tính', inp('u_name', u.name, 'VD: số, người, phòng, xe, tháng'), true)+
    '<button class="btn" onclick="saveUnit(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm đơn vị')+'</button>'+
    (p.id? delBtn('doDeleteUnit', p.id):'')+'</div>';
  return { title: p.id? 'Sửa đơn vị tính':'Thêm đơn vị tính', html:h };
};
function saveUnit(id){
  var name = val('u_name'); if(!name){ toast('Vui lòng nhập tên đơn vị'); return; }
  var pr = id? updateRec('units', id, {name:name}) : createRec('units', {name:name});
  pr.then(function(){ toast('Đã lưu đơn vị'); goBack(); }).catch(errToast);
}
function doDeleteUnit(id){ deleteRec('units', id).then(function(){ toast('Đã xóa đơn vị'); replace('units'); }).catch(errToast); }

/* ================================================================
   21) CHI TIÊU
   ================================================================ */
VIEWS.expenses = function(p){
  var f = p.houseId||'';
  var list = db.expenses.filter(function(e){ return !f || e.houseId===f; });
  var total = list.reduce(function(s,e){ return s+e.amount; }, 0);
  var h = '<div class="hero"><div>Tổng chi tiêu</div><div class="big">'+fmt(total)+'</div></div>';
  h += '<div class="card static">'+ fld('Lọc theo nhà', houseSel('ex_house', f, 'Tất cả nhà')) +
    '<button class="btn sm" onclick="replace(\'expenses\',{houseId:val(\'ex_house\')})">Lọc</button></div>';
  if(!list.length) h += '<div class="empty-note">Chưa có khoản chi nào</div>';
  list.forEach(function(e){
    h += '<div class="card" onclick="show(\'expenseForm\',{id:\''+e.id+'\'})"><div class="row"><h3>'+esc(e.title)+'</h3><span class="price">'+fmt(e.amount)+'</span></div>'+
      '<div class="sub">'+esc(houseName(e.houseId))+' • '+fmtDate(e.date)+(e.note? ' • '+esc(e.note):'')+'</div></div>';
  });
  h += fabBtn("show('expenseForm')");
  return { title:'Chi tiêu', html:h };
};
VIEWS.expenseForm = function(p){
  var e = p.id? byId(db.expenses, p.id) : {houseId:(db.houses[0]||{}).id, title:'', amount:'', date:today(), note:''};
  var cats = ['Thanh lý hợp đồng','Sửa chữa','Mua đồ','Vệ sinh','Khác'];
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('e_house', e.houseId))+
    fld('Khoản chi', sel('e_titleSel', cats, cats.indexOf(e.title)>=0? e.title : 'Khác'))+
    fld('Tiêu đề chi tiết', inp('e_title', e.title))+
    fld('Số tiền (vnđ)', inpNum('e_amount', e.amount), true)+
    fld('Ngày chi', inpDate('e_date', e.date))+
    fld('Ghi chú', inp('e_note', e.note))+
    '<button class="btn" onclick="saveExpense(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm chi tiêu')+'</button>'+
    (p.id? delBtn('doDeleteExpense', p.id):'')+'</div>';
  return { title: p.id? 'Sửa chi tiêu':'Thêm chi tiêu', html:h };
};
function saveExpense(id){
  var title = val('e_title') || val('e_titleSel');
  var data = { houseId: val('e_house')||null, title: title, amount: num(val('e_amount')), date: val('e_date')||today(), note: val('e_note') };
  var pr = id? updateRec('expenses', id, data) : createRec('expenses', data);
  pr.then(function(){ toast('Đã lưu chi tiêu'); goBack(); }).catch(errToast);
}
function doDeleteExpense(id){ deleteRec('expenses', id).then(function(){ toast('Đã xóa khoản chi'); replace('expenses'); }).catch(errToast); }

/* ================================================================
   22) SỰ CỐ — danh sách lọc + thêm + chi tiết + workflow trạng thái
   ================================================================ */
var INCIDENT_TYPES = ['Hỏng điện','Hỏng nước','Hỏng mạng','Khác'];
var INCIDENT_STATUS = ['Chưa sửa','Tiếp nhận sự cố','Đang sửa','Đã sửa'];
function incidentBadge(st){ return '<span class="badge '+(st==='Chưa sửa'?'b-new':st==='Tiếp nhận sự cố'?'b-received':st==='Đang sửa'?'b-fixing':'b-done')+'">'+st+'</span>'; }
VIEWS.incidents = function(p){
  var f = { houseId:p.houseId||'', roomId:p.roomId||'', type:p.type||'', status:p.status||'' };
  var h = '<div class="card static"><div class="row"><div style="flex:1">'+fld('Nhà', houseSel('ic_house', f.houseId, 'Tất cả nhà'))+'</div><div style="flex:1">'+
    fld('Phòng', roomSel('ic_room', f.houseId, f.roomId, 'Tất cả phòng'))+'</div></div><div class="row"><div style="flex:1">'+
    fld('Loại sự cố', sel('ic_type', [['','Tất cả']].concat(INCIDENT_TYPES), f.type))+'</div><div style="flex:1">'+
    fld('Trạng thái', sel('ic_status', [['','Tất cả']].concat(INCIDENT_STATUS), f.status))+'</div></div>'+
    '<button class="btn sm" onclick="applyIncidentFilter()">Lọc</button></div>';
  var list = db.incidents.filter(function(i){ return (!f.houseId||i.houseId===f.houseId) && (!f.roomId||i.roomId===f.roomId) && (!f.type||i.type===f.type) && (!f.status||i.status===f.status); });
  if(!list.length) h += '<div class="empty-note">Không có sự cố nào</div>';
  list.forEach(function(i){
    h += '<div class="card" onclick="show(\'incidentDetail\',{id:\''+i.id+'\'})"><div class="row"><h3>'+esc(i.type)+'</h3>'+incidentBadge(i.status)+'</div>'+
      '<div class="sub">'+esc(houseName(i.houseId))+' - '+esc(roomName(i.roomId)||'')+
      '<br>SĐT người gặp sự cố: '+esc(i.phone)+'<br>Người tạo: '+esc(i.creator)+(i.assignee? ' • Người tiếp nhận: '+esc(i.assignee):'')+'</div></div>';
  });
  h += fabBtn("show('incidentForm')");
  return { title:'Danh sách sự cố', html:h };
};
function applyIncidentFilter(){ replace('incidents', {houseId:val('ic_house'), roomId:val('ic_room'), type:val('ic_type'), status:val('ic_status')}); }
VIEWS.incidentForm = function(p){
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('icf_house', (db.houses[0]||{}).id))+
    fld('Phòng', roomSel('icf_room', (db.houses[0]||{}).id, '', '-- Chọn phòng --'))+
    fld('Loại sự cố', sel('icf_type', INCIDENT_TYPES, 'Hỏng điện'))+
    fld('SĐT người gặp sự cố', inp('icf_phone', ''), true)+
    fld('Ghi chú', '<textarea id="icf_note"></textarea>')+
    '<button class="btn" onclick="saveIncident()">Thêm sự cố</button></div>';
  return { title:'Thêm sự cố', html:h, after:function(){
    var s = document.getElementById('icf_house');
    if(s) s.onchange = function(){ var cur = val('icf_room'); var wrap = document.getElementById('icf_room'); if(wrap){ var holder = document.createElement('div'); holder.innerHTML = roomSel('icf_room', s.value, cur, '-- Chọn phòng --'); wrap.replaceWith(holder.firstChild); } };
  }};
};
function saveIncident(){
  var data = { houseId: val('icf_house'), roomId: val('icf_room')||null, type: val('icf_type'), phone: val('icf_phone'),
    note: val('icf_note'), status:'Chưa sửa', creator: db.settings.userName, assignee:'', date: today() };
  createRec('incidents', data).then(function(){ toast('Đã thêm sự cố'); goBack(); }).catch(errToast);
}
VIEWS.incidentDetail = function(p){
  var i = byId(db.incidents, p.id); if(!i) return VIEWS.incidents(p);
  var h = '<div class="card static"><div class="row"><h3>'+esc(i.type)+'</h3>'+incidentBadge(i.status)+'</div>'+
    '<div class="kv"><span>Nhà</span><span>'+esc(houseName(i.houseId))+'</span></div>'+
    '<div class="kv"><span>Phòng</span><span>'+esc(roomName(i.roomId)||'')+'</span></div>'+
    '<div class="kv"><span>SĐT người gặp sự cố</span><span>'+esc(i.phone)+'</span></div>'+
    '<div class="kv"><span>Người tạo</span><span>'+esc(i.creator)+'</span></div>'+
    '<div class="kv"><span>Người tiếp nhận</span><span>'+esc(i.assignee||'—')+'</span></div>'+
    '<div class="kv"><span>Ngày tạo</span><span>'+fmtDate(i.date)+'</span></div>'+
    '<div class="kv"><span>Ghi chú</span><span>'+esc(i.note||'—')+'</span></div></div>';
  if(i.status==='Chưa sửa') h += fld('Người tiếp nhận', inp('ic_assignee', db.settings.userName)) + '<button class="btn orange" onclick="incidentNext(\''+i.id+'\',\'Tiếp nhận sự cố\')">Tiếp nhận sự cố</button>';
  else if(i.status==='Tiếp nhận sự cố') h += '<button class="btn" onclick="incidentNext(\''+i.id+'\',\'Đang sửa\')">Đang xử lý</button>';
  else if(i.status==='Đang sửa') h += '<button class="btn green" onclick="incidentNext(\''+i.id+'\',\'Đã sửa\')">Hoàn thành (Đã sửa)</button>';
  h += delBtn('doDeleteIncident', i.id);
  return { title:'Chi tiết sự cố', html:h };
};
function incidentNext(id, next){
  var data = { status: next };
  var a = document.getElementById('ic_assignee'); if(a) data.assignee = a.value.trim();
  updateRec('incidents', id, data).then(function(){ toast('Đã chuyển trạng thái: ' + next); render(); }).catch(errToast);
}
function doDeleteIncident(id){ deleteRec('incidents', id).then(function(){ toast('Đã xóa sự cố'); replace('incidents'); }).catch(errToast); }

/* ================================================================
   23) ĐẶT CỌC — danh sách + form đặt cọc phòng
   ================================================================ */
VIEWS.deposits = function(){
  var h = '';
  if(!db.deposits.length) h += '<div class="empty-note">Chưa có khách đặt cọc</div>';
  db.deposits.forEach(function(d){
    h += '<div class="card" onclick="show(\'depositForm\',{id:\''+d.id+'\'})"><div class="row"><h3>'+esc(d.customerName)+'</h3><span class="price">'+fmt(d.amount)+'</span></div>'+
      '<div class="sub">SĐT: '+esc(d.phone)+'<br>'+esc(houseName(d.houseId))+' • '+esc(roomName(d.roomId))+' • Ngày cọc: '+fmtDate(d.date)+(d.note? '<br>'+esc(d.note):'')+'</div></div>';
  });
  h += fabBtn("show('depositForm')");
  return { title:'Danh sách khách cọc', html:h };
};
VIEWS.depositForm = function(p){
  var d = p.id? byId(db.deposits, p.id) : {houseId:(db.houses[0]||{}).id, roomId:'', customerName:'', phone:'', amount:'', date:today(), note:''};
  var emptyRooms = db.rooms.filter(function(r){ return !activeContract(r.id); });
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('dp_house', d.houseId))+
    fld('Phòng', sel('dp_room', emptyRooms.filter(function(r){ return r.houseId===d.houseId || r.id===d.roomId; }).map(function(r){ return [r.id, r.name]; }), d.roomId||''), true)+
    fld('Tên khách cọc', inp('dp_name', d.customerName), true)+
    fld('SĐT', inp('dp_phone', d.phone), true)+
    fld('Số tiền cọc (vnđ)', inpNum('dp_amount', d.amount), true)+
    fld('Ngày cọc', inpDate('dp_date', d.date))+
    fld('Ghi chú', inp('dp_note', d.note))+
    '<button class="btn" onclick="saveDeposit(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Đặt cọc phòng')+'</button>'+
    (p.id? delBtn('doDeleteDeposit', p.id):'')+'</div>';
  return { title:'Đặt cọc phòng', html:h, after:function(){
    var s = document.getElementById('dp_house');
    if(s) s.onchange = function(){
      var rooms = db.rooms.filter(function(r){ return r.houseId===s.value && !activeContract(r.id); });
      var el = document.getElementById('dp_room');
      if(el) el.innerHTML = rooms.map(function(r){ return '<option value="'+r.id+'">'+esc(r.name)+'</option>'; }).join('');
    };
  }};
};
function saveDeposit(id){
  var data = { houseId: val('dp_house'), roomId: val('dp_room'), customerName: val('dp_name'), phone: val('dp_phone'),
    amount: num(val('dp_amount')), date: val('dp_date')||today(), note: val('dp_note') };
  if(!data.roomId || !data.customerName){ toast('Vui lòng chọn phòng và nhập tên khách'); return; }
  var pr = id? updateRec('deposits', id, data) : createRec('deposits', data);
  pr.then(function(){ toast('Đã lưu đặt cọc'); goBack(); }).catch(errToast);
}
function doDeleteDeposit(id){ deleteRec('deposits', id).then(function(){ toast('Đã xóa đặt cọc'); replace('deposits'); }).catch(errToast); }
/* ================================================================
   24) CHỦ NHÀ — DS chủ nhà / HĐ chủ nhà / thanh toán tiền nhà /
       chốt điện nước chủ nhà + lịch sử
   ================================================================ */
VIEWS.landlords = function(){
  var h = '';
  if(!db.landlords.length) h += '<div class="empty-note">Chưa có chủ nhà</div>';
  db.landlords.forEach(function(l){
    var nHouses = db.houses.filter(function(x){ return x.landlordId===l.id; }).length;
    h += '<div class="card" onclick="show(\'landlordForm\',{id:\''+l.id+'\'})"><h3>'+esc(l.name)+'</h3>'+
      '<div class="sub">SĐT: '+esc(l.phone)+' • '+esc(l.address)+'<br>'+nHouses+' nhà đang thuê</div></div>';
  });
  h += '<div class="btnrow"><button class="btn" onclick="show(\'landlordContracts\')">Hợp đồng chủ nhà</button>'+
    '<button class="btn orange" onclick="show(\'housePayments\')">Thanh toán tiền nhà</button></div>';
  h += fabBtn("show('landlordForm')");
  return { title:'Danh sách chủ nhà', html:h };
};
VIEWS.landlordForm = function(p){
  var l = p.id? byId(db.landlords, p.id) : {name:'', phone:'', address:''};
  var h = '<div class="card static">'+
    fld('Tên chủ nhà', inp('ll_name', l.name), true)+
    fld('SĐT', inp('ll_phone', l.phone))+
    fld('Địa chỉ', inp('ll_address', l.address))+
    '<button class="btn" onclick="saveLandlord(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm chủ nhà')+'</button>'+
    (p.id? delBtn('doDeleteLandlord', p.id):'')+'</div>';
  return { title: p.id? 'Sửa chủ nhà':'Thêm chủ nhà', html:h };
};
function saveLandlord(id){
  var data = { name: val('ll_name'), phone: val('ll_phone'), address: val('ll_address') };
  if(!data.name){ toast('Vui lòng nhập tên chủ nhà'); return; }
  var pr = id? updateRec('landlords', id, data) : createRec('landlords', data);
  pr.then(function(){ toast('Đã lưu chủ nhà'); goBack(); }).catch(errToast);
}
function doDeleteLandlord(id){ deleteRec('landlords', id).then(function(){ toast('Đã xóa chủ nhà'); replace('landlords'); }).catch(errToast); }
VIEWS.landlordContracts = function(){
  var h = '';
  if(!db.landlordContracts.length) h += '<div class="empty-note">Chưa có hợp đồng chủ nhà</div>';
  db.landlordContracts.forEach(function(c){
    h += '<div class="card" onclick="show(\'landlordContractForm\',{id:\''+c.id+'\'})"><h3>'+esc(houseName(c.houseId))+'</h3>'+
      '<div class="sub">Chủ nhà: '+esc(landlordName(c.landlordId))+'<br>Giá thuê nhà: '+fmt(c.rentPrice)+'/tháng • Ngày thanh toán: '+c.payDay+
      '<br>Thời hạn: '+fmtDate(c.startDate)+' – '+fmtDate(c.endDate)+'</div></div>';
  });
  h += fabBtn("show('landlordContractForm')");
  return { title:'Hợp đồng chủ nhà', html:h };
};
VIEWS.landlordContractForm = function(p){
  var c = p.id? byId(db.landlordContracts, p.id) : {landlordId:(db.landlords[0]||{}).id, houseId:'', rentPrice:'', startDate:today(), endDate:'', payDay:5};
  var rentedHouses = db.houses.filter(function(x){ return x.type==='rented'; });
  var h = '<div class="card static">'+
    fld('Chủ nhà', sel('lc_landlord', db.landlords.map(function(l){ return [l.id, l.name]; }), c.landlordId||''), true)+
    fld('Nhà thuê', sel('lc_house', rentedHouses.map(function(x){ return [x.id, x.address]; }), c.houseId||''), true)+
    fld('Giá thuê nhà (vnđ/tháng)', inpNum('lc_rent', c.rentPrice), true)+
    '<div class="row"><div style="flex:1">'+fld('Từ ngày', inpDate('lc_start', c.startDate))+'</div><div style="flex:1">'+fld('Đến ngày', inpDate('lc_end', c.endDate))+'</div></div>'+
    fld('Ngày thanh toán hàng tháng', inpNum('lc_payDay', c.payDay))+
    '<button class="btn" onclick="saveLandlordContract(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Tạo hợp đồng nhà')+'</button>'+
    (p.id? delBtn('doDeleteLandlordContract', p.id):'')+'</div>';
  return { title: p.id? 'Sửa hợp đồng nhà':'Tạo hợp đồng nhà', html:h };
};
function saveLandlordContract(id){
  var data = { landlordId: val('lc_landlord'), houseId: val('lc_house'), rentPrice: num(val('lc_rent')),
    startDate: val('lc_start')||null, endDate: val('lc_end')||null, payDay: num(val('lc_payDay'))||5 };
  if(!data.landlordId || !data.houseId){ toast('Vui lòng chọn chủ nhà và nhà thuê'); return; }
  var pr = id? updateRec('landlordContracts', id, data) : createRec('landlordContracts', data);
  pr.then(function(){ toast('Đã lưu hợp đồng chủ nhà'); goBack(); }).catch(errToast);
}
function doDeleteLandlordContract(id){ deleteRec('landlordContracts', id).then(function(){ toast('Đã xóa'); replace('landlordContracts'); }).catch(errToast); }
VIEWS.housePayments = function(){
  var rented = db.houses.filter(function(x){ return x.type==='rented'; });
  var h = '<div class="secttl">Nhà đang thuê — thanh toán cho chủ nhà</div>';
  if(!rented.length) h += '<div class="empty-note">Chưa có nhà thuê nào</div>';
  rented.forEach(function(hs){
    var lc = db.landlordContracts.filter(function(x){ return x.houseId===hs.id; })[0];
    var paidThisMonth = db.housePayments.filter(function(x){ return x.houseId===hs.id && x.status==='paid' && (x.date||'').slice(0,7)===curMonth(); }).length>0;
    h += '<div class="card static"><div class="row"><h3>'+esc(hs.address)+'</h3><span class="badge '+(paidThisMonth?'b-paid':'b-unpaid')+'">'+(paidThisMonth?'Đã thanh toán tháng này':'Chưa thanh toán tháng này')+'</span></div>'+
      '<div class="sub">Chủ nhà: '+esc(landlordName(hs.landlordId))+(lc? ' • Tiền nhà: '+fmt(lc.rentPrice)+'/tháng • Ngày TT: '+lc.payDay : ' • Chưa có hợp đồng chủ nhà')+'</div>'+
      (lc? '<div class="row" style="margin-top:8px"><input type="number" id="hp_'+hs.id+'" value="'+lc.rentPrice+'" style="flex:1"><button class="btn sm green" onclick="payHouseRent(\''+hs.id+'\')">Thanh toán</button></div>':'')+'</div>';
  });
  h += '<div class="secttl">Lịch sử thanh toán tiền nhà</div>';
  var pays = db.housePayments.slice().sort(function(a,b){ return (a.date||'') < (b.date||'') ? 1 : -1; });
  if(!pays.length) h += '<div class="empty-note">Chưa có lần thanh toán nào</div>';
  pays.forEach(function(x){
    h += '<div class="card static"><div class="row"><span>'+esc(houseName(x.houseId))+' — '+fmtDate(x.date)+'</span><span class="price">'+fmt(x.amount)+'</span></div>'+
      '<div class="sub">Chủ nhà: '+esc(landlordName(x.landlordId))+' • '+(x.status==='paid'?'Đã thanh toán':'Chưa thanh toán')+'</div></div>';
  });
  return { title:'Thanh toán tiền nhà', html:h };
};
function payHouseRent(houseId){
  var hs = byId(db.houses, houseId);
  var amount = num(val('hp_' + houseId));
  if(!amount){ toast('Vui lòng nhập số tiền'); return; }
  createRec('housePayments', { houseId: houseId, landlordId: hs.landlordId, amount: amount, date: today(), status:'paid' })
    .then(function(){ toast('Đã ghi thanh toán tiền nhà'); render(); }).catch(errToast);
}
VIEWS.landlordMeter = function(p){
  var houseId = p.houseId || (db.houses[0]||{}).id;
  var h = '<div class="card static">'+
    fld('Nhà', houseSel('lm_house', houseId))+
    fld('Ngày chốt', inpDate('lm_date', today()))+
    fld('Tiền điện (vnđ)', inpNum('lm_dien', 0))+
    fld('Tiền nước (vnđ)', inpNum('lm_nuoc', 0))+
    fld('Tiền internet (vnđ)', inpNum('lm_internet', 0))+
    fld('Tiền vệ sinh (vnđ)', inpNum('lm_vesinh', 0))+
    '<button class="btn" onclick="saveLandlordMeter()">Chốt điện nước chủ nhà</button>'+
    '<button class="btn gray" onclick="show(\'landlordMeterHistory\',{houseId:val(\'lm_house\')})">Lịch sử chốt</button></div>';
  return { title:'Chốt điện nước — chủ nhà', html:h };
};
function saveLandlordMeter(){
  var data = { houseId: val('lm_house'), date: val('lm_date')||today(), dien: num(val('lm_dien')), nuoc: num(val('lm_nuoc')), internet: num(val('lm_internet')), vesinh: num(val('lm_vesinh')) };
  createRec('landlordMeterReadings', data).then(function(o){ toast('Đã chốt, tổng: ' + fmt(o.total)); show('landlordMeterHistory', {houseId: data.houseId}); }).catch(errToast);
}
VIEWS.landlordMeterHistory = function(p){
  var houseId = p.houseId || '';
  var list = db.landlordMeterReadings.filter(function(x){ return !houseId || x.houseId===houseId; });
  list.sort(function(a,b){ return (a.date||'') < (b.date||'') ? 1 : -1; });
  var h = '';
  if(!list.length) h += '<div class="empty-note">Chưa có lần chốt nào</div>';
  list.forEach(function(x){
    h += '<div class="card static"><div class="row"><h3>'+fmtDate(x.date)+'</h3><span class="price">'+fmt(x.total)+'</span></div>'+
      '<div class="sub">'+esc(houseName(x.houseId))+'<br>Điện: '+fmt(x.dien)+' • Nước: '+fmt(x.nuoc)+' • Internet: '+fmt(x.internet)+' • Vệ sinh: '+fmt(x.vesinh)+'</div>'+
      '<button class="btn sm red" onclick="confirmBox(\'Xóa lần chốt này?\',\'doDeleteLandlordMeter\',\''+x.id+'\')">Xóa</button></div>';
  });
  return { title:'Lịch sử chốt điện nước chủ nhà', html:h };
};
function doDeleteLandlordMeter(id){ deleteRec('landlordMeterReadings', id).then(function(){ toast('Đã xóa'); goBack(); render(); }).catch(errToast); }

/* ================================================================
   25) PHÂN TÍCH — biểu đồ thu/chi/lợi nhuận (div) + dòng vốn
   ================================================================ */
function barChart(rows, key, color){
  var max = Math.max.apply(null, rows.map(function(r){ return Math.abs(r[key]); }).concat([1]));
  var h = '<div class="chart">';
  rows.forEach(function(r){
    var pct = Math.max(2, Math.round(Math.abs(r[key]) / max * 100));
    h += '<div class="col"><span class="cv">'+fmt(r[key])+'</span><div class="bar" style="height:'+pct+'%;background:'+color+'"></div><span class="cl">'+r.month.slice(5)+'/'+r.month.slice(2,4)+'</span></div>';
  });
  return h + '</div>';
}
VIEWS.analytics = function(){
  return { title:'Phân tích', html:'<div id="anaBody"><div class="loading">Đang tải phân tích...</div></div>', after:function(){
    api('/analytics/summary').then(function(data){
      var el = document.getElementById('anaBody'); if(!el) return;
      var rows = data.months || [];
      var h = '<div class="secttl">Biểu đồ thu (hóa đơn đã thanh toán)</div>' + barChart(rows, 'income', '#43a047') +
        '<div class="secttl">Biểu đồ chi (chi tiêu + tiền nhà)</div>' + barChart(rows, 'expense', '#e53935') +
        '<div class="secttl">Biểu đồ lợi nhuận (thu − chi)</div>' + barChart(rows, 'profit', '#1976d2') +
        '<div class="secttl">Phân tích dòng vốn</div><table><tr><th>Tháng</th><th>Thu</th><th>Chi</th><th>Lợi nhuận</th><th>Lũy kế</th></tr>';
      rows.forEach(function(r){ h += '<tr><td>'+monthLabel(r.month)+'</td><td>'+fmt(r.income)+'</td><td>'+fmt(r.expense)+'</td><td>'+fmt(r.profit)+'</td><td><b>'+fmt(r.cumulative)+'</b></td></tr>'; });
      el.innerHTML = h + '</table>';
    }).catch(function(e){ var el = document.getElementById('anaBody'); if(el) el.innerHTML = '<div class="empty-note">Lỗi: '+esc(e.message)+'</div>'; });
  }};
};

/* ================================================================
   26) PHÂN QUYỀN — tài khoản / module / theo nhà
   ================================================================ */
var ALL_MODULES = [['rooms','Quản lý phòng'],['houses','Quản lý nhà'],['contracts','Hợp đồng'],['customers','Khách hàng'],['invoices','Hóa đơn'],['meter','Chốt điện nước'],['incidents','Sự cố'],['assets','Tài sản'],['services','Dịch vụ'],['expenses','Chi tiêu'],['vehicles','Xe'],['deposits','Đặt cọc'],['landlords','Chủ nhà'],['analytics','Phân tích'],['settings','Cài đặt']];
VIEWS.accounts = function(){
  var h = '';
  if(!db.accounts.length) h += '<div class="empty-note">Chưa có tài khoản</div>';
  db.accounts.forEach(function(a){
    h += '<div class="card" onclick="show(\'accountForm\',{id:\''+a.id+'\'})"><div class="row"><h3>'+esc(a.name)+'</h3><span class="badge b-fixing">'+esc(roleLabel(a.role))+'</span></div>'+
      '<div class="sub">SĐT: '+esc(a.phone)+'<br>Quyền module: '+((a.modules||[]).indexOf('all')>=0? 'Tất cả' : (a.modules||[]).length + ' module')+' • Quản lý '+(a.houseIds||[]).length+' nhà</div></div>';
  });
  h += fabBtn("show('accountForm')");
  return { title:'Phân quyền nhân sự', html:h };
};
VIEWS.accountForm = function(p){
  var a = p.id? byId(db.accounts, p.id) : {name:'', phone:'', role:'staff', modules:[], houseIds:[]};
  var roleOpts = [['admin','Quản trị viên'],['staff','Nhân viên']];
  if(a.role && roleOpts.every(function(o){ return o[0]!==a.role; })) roleOpts.push([a.role, a.role]);
  var h = '<div class="card static">'+
    fld('Tên nhân sự', inp('ac_name', a.name), true)+
    fld('SĐT (dùng để đăng nhập)', inp('ac_phone', a.phone), true)+
    fld('Vai trò', sel('ac_role', roleOpts, a.role))+
    (p.id? '' : fld('Mật khẩu đăng nhập', '<input id="ac_password" type="password" placeholder="Để trống = mặc định 123456">'))+
    '<button class="btn" onclick="saveAccount(\''+(p.id||'')+'\')">'+(p.id?'Cập nhật':'Thêm tài khoản')+'</button>'+
    (p.id? '<div class="btnrow"><button class="btn orange" onclick="show(\'accountModules\',{id:\''+a.id+'\'})">Cập nhật quyền nhân sự</button>'+
      '<button class="btn" onclick="show(\'accountHouses\',{id:\''+a.id+'\'})">Phân quyền theo nhà</button></div>' + delBtn('doDeleteAccount', a.id) : '')+
    '</div>';
  if(p.id){
    h += '<div class="card static"><h3>Đặt lại mật khẩu</h3><div class="sub">Chỉ quản trị viên (admin) mới đặt lại được mật khẩu cho tài khoản khác.</div>'+
      fld('Mật khẩu mới', '<input id="ac_newpass" type="password" placeholder="Ít nhất 6 ký tự">')+
      '<button class="btn orange" onclick="doResetPassword(\''+a.id+'\')">Đặt lại mật khẩu</button></div>';
  }
  return { title: p.id? 'Sửa tài khoản':'Thêm tài khoản', html:h };
};
function saveAccount(id){
  var data = { name: val('ac_name'), phone: val('ac_phone'), role: val('ac_role') };
  if(!data.name){ toast('Vui lòng nhập tên'); return; }
  if(!data.phone){ toast('Vui lòng nhập số điện thoại'); return; }
  var pr;
  if(id){ pr = updateRec('accounts', id, data); }
  else { data.password = val('ac_password') || '123456'; pr = createRec('accounts', Object.assign({modules:[], houseIds:[]}, data)); }
  pr.then(function(){ toast('Đã lưu tài khoản'); goBack(); }).catch(errToast);
}
function doResetPassword(id){
  var pw = val('ac_newpass');
  if(!pw || pw.length < 6){ toast('Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
  api('/accounts/' + id + '/reset-password', 'POST', { new_password: pw }).then(function(){
    toast('Đã đặt lại mật khẩu'); document.getElementById('ac_newpass').value = '';
  }).catch(errToast);
}
function doDeleteAccount(id){ deleteRec('accounts', id).then(function(){ toast('Đã xóa tài khoản'); replace('accounts'); }).catch(errToast); }
VIEWS.accountModules = function(p){
  var a = byId(db.accounts, p.id); if(!a) return VIEWS.accounts(p);
  var mods = a.modules||[];
  var h = '<div class="card static"><h3>'+esc(a.name)+'</h3><div class="sub">Tick các module được phép sử dụng</div>'+
    '<label class="chk"><input type="checkbox" class="mod-chk" value="all"'+(mods.indexOf('all')>=0?' checked':'')+'> Tất cả quyền (Quản lý)</label>';
  ALL_MODULES.forEach(function(m){
    h += '<label class="chk"><input type="checkbox" class="mod-chk" value="'+m[0]+'"'+(mods.indexOf(m[0])>=0?' checked':'')+'> '+m[1]+'</label>';
  });
  h += '<button class="btn" onclick="saveAccountModules(\''+a.id+'\')">Lưu quyền</button></div>';
  return { title:'Cập nhật quyền nhân sự', html:h };
};
function saveAccountModules(id){
  var mods = []; document.querySelectorAll('.mod-chk').forEach(function(cb){ if(cb.checked) mods.push(cb.value); });
  if(mods.indexOf('all')>=0) mods = ['all'];
  updateRec('accounts', id, {modules: mods}).then(function(){ toast('Đã cập nhật quyền'); goBack(); }).catch(errToast);
}
VIEWS.accountHouses = function(p){
  var a = byId(db.accounts, p.id); if(!a) return VIEWS.accounts(p);
  var hs = a.houseIds||[];
  var h = '<div class="card static"><h3>'+esc(a.name)+'</h3><div class="sub">Tick các nhà nhân sự này được quản lý</div>';
  db.houses.forEach(function(x){
    h += '<label class="chk"><input type="checkbox" class="hs-chk" value="'+x.id+'"'+(hs.indexOf(x.id)>=0?' checked':'')+'> '+esc(x.address)+'</label>';
  });
  h += '<button class="btn" onclick="saveAccountHouses(\''+a.id+'\')">Lưu phân quyền nhà</button></div>';
  return { title:'Phân quyền theo nhà', html:h };
};
function saveAccountHouses(id){
  var ids = []; document.querySelectorAll('.hs-chk').forEach(function(cb){ if(cb.checked) ids.push(cb.value); });
  updateRec('accounts', id, {houseIds: ids}).then(function(){ toast('Đã lưu phân quyền nhà'); goBack(); }).catch(errToast);
}

/* ================================================================
   27) CÀI ĐẶT
   ================================================================ */
VIEWS.settings = function(){
  var u = currentUser || {};
  var h = '<div class="card static"><h3>Thông tin người dùng</h3>'+
    '<div class="kv"><span>Tài khoản</span><span>'+esc(u.name || db.settings.userName)+'</span></div>'+
    '<div class="kv"><span>Vai trò</span><span>'+esc(roleLabel(u.role))+'</span></div>'+
    fld('Họ tên', inp('st_name', db.settings.userName))+
    fld('SĐT', inp('st_phone', db.settings.userPhone))+
    '<button class="btn" onclick="saveSettings()">Lưu thông tin</button></div>'+
    '<div class="card static"><h3>Đổi mật khẩu</h3>'+
    fld('Mật khẩu cũ', '<input id="cp_old" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu hiện tại">', true)+
    fld('Mật khẩu mới', '<input id="cp_new" type="password" autocomplete="new-password" placeholder="Ít nhất 6 ký tự">', true)+
    fld('Nhập lại mật khẩu mới', '<input id="cp_new2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu mới">', true)+
    '<button class="btn" onclick="doChangePassword()">Đổi mật khẩu</button></div>'+
    '<div class="card static"><h3>Dữ liệu</h3><div class="sub">Xóa toàn bộ dữ liệu hiện tại và nạp lại dữ liệu mẫu ban đầu.</div>'+
    '<button class="btn red" onclick="confirmBox(\'Xóa toàn bộ dữ liệu và nạp lại dữ liệu mẫu?\',\'doResetData\',\'x\')">Xóa dữ liệu & nạp lại dữ liệu mẫu</button></div>'+
    '<div class="card static"><div class="kv"><span>Phiên bản</span><span>1.1.0 (FastAPI + PostgreSQL)</span></div>'+
    '<div class="kv"><span>Máy chủ API</span><span>/api</span></div></div>'+
    '<button class="btn gray" onclick="confirmBox(\'Bạn muốn đăng xuất khỏi ứng dụng?\',\'doLogout\',\'x\')">Đăng xuất</button>';
  return { title:'Cài đặt', html:h };
};
function saveSettings(){
  if(!currentUser){ toast('Chưa đăng nhập'); return; }
  var me = byId(db.accounts, currentUser.id);
  var data = { name: val('st_name'), phone: val('st_phone') };
  if(!me){ toast('Không tìm thấy tài khoản của bạn trong danh sách'); return; }
  updateRec('accounts', me.id, data).then(function(){
    currentUser.name = data.name; currentUser.phone = data.phone; syncUserInfo(); toast('Đã lưu'); render();
  }).catch(errToast);
}
function doChangePassword(){
  var oldPw = val('cp_old'), newPw = val('cp_new'), newPw2 = val('cp_new2');
  if(!oldPw || !newPw){ toast('Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới'); return; }
  if(newPw.length < 6){ toast('Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
  if(newPw !== newPw2){ toast('Mật khẩu mới nhập lại không khớp'); return; }
  api('/auth/change-password', 'POST', { old_password: oldPw, new_password: newPw }).then(function(){
    toast('Đã đổi mật khẩu thành công');
    ['cp_old','cp_new','cp_new2'].forEach(function(id){ var e = document.getElementById(id); if(e) e.value=''; });
  }).catch(errToast);
}
function doResetData(){
  api('/seed', 'POST', {}).then(function(){ return loadAll(); })
    .then(function(){ toast('Đã nạp lại dữ liệu mẫu'); navStack = []; replace('home'); }).catch(errToast);
}

/* ---------- Khởi động ----------
   Có token -> kiểm tra /api/auth/me -> nạp dữ liệu -> vào Home.
   Chưa có token hoặc token không hợp lệ -> màn hình đăng nhập. */
function bootApp(){
  var tk = getToken();
  if(!tk){ showLogin(); return; }
  document.getElementById('app').innerHTML = '<div class="loading">Đang kiểm tra đăng nhập...</div>';
  api('/auth/me').then(function(u){
    currentUser = u;
    syncUserInfo();
    return loadAll();
  }).then(function(){
    navStack = []; curView = 'home'; curParams = {}; render();
  }).catch(function(e){
    if(getToken()){ // vẫn còn token mà lỗi khác 401 (vd mất mạng) -> cho thử lại
      document.getElementById('app').innerHTML = '<div class="empty-note">Không kết nối được máy chủ API.<br>' + esc(e.message) + '<br><button class="btn" onclick="location.reload()">Thử lại</button></div>';
    }
    // trường hợp 401: api() đã tự xóa token và hiện màn hình đăng nhập
  });
}
bootApp();
