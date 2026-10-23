'use strict';
/* ================================================================
   NHÀ TRỌ VIỆT — Frontend WEB (desktop SPA, vanilla JS)
   Dữ liệu qua REST API /api kèm JWT; cache trong biến db.
   ================================================================ */
var API = '/api';
var ENDPOINTS = {
  houses:'houses', rooms:'rooms', customers:'customers', contracts:'contracts',
  meterReadings:'meter-readings', landlordMeterReadings:'landlord-meter-readings',
  invoices:'invoices', vehicles:'vehicles', assets:'assets', services:'services',
  units:'units', expenses:'expenses', incidents:'incidents', deposits:'deposits',
  landlords:'landlords', landlordContracts:'landlord-contracts',
  housePayments:'house-payments', accounts:'accounts',
  receipts:'receipts', positions:'positions', staffAssignments:'staff-assignments',
  houseUtilities:'house-utilities'
};
var db = { settings:{ userName:'', userPhone:'' } };
Object.keys(ENDPOINTS).forEach(function(k){ db[k] = []; });

/* ---------- Xác thực (JWT) ---------- */
var TOKEN_KEY = 'nhatro_token';
var currentUser = null;
function getToken(){ try{ return localStorage.getItem(TOKEN_KEY); }catch(e){ return null; } }
function setToken(t){ try{ t? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }catch(e){} }
function roleLabel(r){ return r==='admin' ? 'Quản trị viên' : (r==='staff' ? 'Nhân viên' : (r||'')); }
function doLogout(){ setToken(null); currentUser = null; location.reload(); }

/* ---------- Gọi API ---------- */
function api(path, method, body){
  var headers = { 'Content-Type':'application/json' };
  var tk = getToken();
  if(tk) headers['Authorization'] = 'Bearer ' + tk;
  return fetch(API + path, { method: method || 'GET', headers: headers,
    body: body ? JSON.stringify(body) : undefined }).then(function(res){
    return res.text().then(function(txt){
      var data = null; try{ data = txt ? JSON.parse(txt) : null; }catch(e){}
      if(!res.ok){
        if(res.status === 401 && getToken() && path !== '/auth/login'){ setToken(null); currentUser = null; showLogin('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
        var msg = (data && data.detail) || ('Lỗi ' + res.status); throw new Error(msg);
      }
      return data;
    });
  });
}
function loadColl(coll){ return api('/' + ENDPOINTS[coll]).then(function(list){ db[coll] = list || []; }); }
function loadAll(){ return Promise.all(Object.keys(ENDPOINTS).map(loadColl)); }
function createRec(coll, data){
  return api('/' + ENDPOINTS[coll], 'POST', data).then(function(obj){ db[coll].push(obj); return obj; });
}
function updateRec(coll, id, data){
  return api('/' + ENDPOINTS[coll] + '/' + id, 'PUT', data).then(function(obj){
    var i = db[coll].findIndex(function(x){ return x.id === id; });
    if(i >= 0) db[coll][i] = obj; return obj;
  });
}
function deleteRecDirect(coll, id){
  return api('/' + ENDPOINTS[coll] + '/' + id, 'DELETE').then(function(){
    db[coll] = db[coll].filter(function(x){ return x.id !== id; });
  });
}
function errToast(e){ toast('Lỗi: ' + (e.message || e)); }

/* ---------- Tiện ích ---------- */
function fmt(n){ n = Math.round(Number(n)||0); return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'đ'; }
function num(v){ var x = parseInt(String(v==null?'':v).replace(/[^\d-]/g,''),10); return isNaN(x)?0:x; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function curMonth(){ return today().slice(0,7); }
function fmtDate(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso; }
function diffDays(a,b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000); }
function addDays(iso, n){ var d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function monthLabel(ym){ if(!ym) return ''; var p=ym.split('-'); return 'Tháng ' + Number(p[1]) + '/' + p[0]; }
function toast(msg){ var old=document.querySelector('.toast'); if(old) old.remove(); var t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); },2400); }
function val(id){ var e=document.getElementById(id); return e? e.value.trim() : ''; }
function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
function fld(label, inputHtml, required){ return '<div><label class="fl">'+esc(label)+(required?' <b>*</b>':'')+'</label>'+inputHtml+'</div>'; }
function inp(id, value, type, extra){ return '<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(value==null?'':value)+'" '+(extra||'')+'>'; }
function sel(id, options, current){
  var h='<select id="'+id+'">';
  options.forEach(function(o){ var v=Array.isArray(o)?o[0]:o, t=Array.isArray(o)?o[1]:o;
    h+='<option value="'+esc(v)+'"'+(String(v)===String(current)?' selected':'')+'>'+esc(t)+'</option>'; });
  return h+'</select>';
}
function selObj(id, arr, current, labelFn, allLabel){
  var opts = allLabel!==undefined ? [['', allLabel]] : [];
  arr.forEach(function(o){ opts.push([o.id, labelFn(o)]); });
  return sel(id, opts, current);
}
function chk(id, label, on){ return '<label class="chk"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'> '+esc(label)+'</label>'; }
function isChk(id){ var e=document.getElementById(id); return !!(e && e.checked); }

/* ---------- Tra cứu quan hệ trên cache ---------- */
function houseName(id){ var h=byId(db.houses,id); return h? (h.name || h.address) : ''; }
function houseAddr(id){ var h=byId(db.houses,id); return h? h.address : ''; }
function roomName(id){ var r=byId(db.rooms,id); return r? r.name : ''; }
function customerName(id){ var c=byId(db.customers,id); return c? c.name : ''; }
function landlordName(id){ var l=byId(db.landlords,id); return l? l.name : ''; }
function unitName(id){ var u=byId(db.units,id); return u? u.name : ''; }
function positionName(id){ var p=byId(db.positions,id); return p? p.name : ''; }
function accountName(id){ var a=byId(db.accounts,id); return a? a.name : ''; }
function activeContract(roomId){ for(var i=0;i<db.contracts.length;i++){ var c=db.contracts[i]; if(c.roomId===roomId && c.status==='active') return c; } return null; }
function anyContract(roomId){ var a=activeContract(roomId); if(a) return a; for(var i=db.contracts.length-1;i>=0;i--) if(db.contracts[i].roomId===roomId) return db.contracts[i]; return null; }
function landlordContractOf(houseId){ for(var i=0;i<db.landlordContracts.length;i++) if(db.landlordContracts[i].houseId===houseId && db.landlordContracts[i].status!=='liquidated') return db.landlordContracts[i]; return null; }
function roomStatus(room){ if(activeContract(room.id)) return 'rented'; for(var i=0;i<db.deposits.length;i++) if(db.deposits[i].roomId===room.id) return 'deposited'; return 'empty'; }
function statusBadge(st){ if(st==='rented') return '<span class="badge b-rented">Đã thuê</span>'; if(st==='deposited') return '<span class="badge b-deposited">Đã cọc</span>'; return '<span class="badge b-empty">Trống</span>'; }
function invStatus(inv){ var rem=(inv.total||0)-(inv.discount||0)-(inv.paidAmount||0); if(rem<=0) return 'paid'; if((inv.paidAmount||0)>0) return 'partial'; return 'unpaid'; }
function invStatusLabel(st){ return st==='paid' ? 'Thanh toán hết' : (st==='partial' ? 'Thanh toán thiếu' : 'Chưa thanh toán'); }
function invBadge(inv){ var st=invStatus(inv); return '<span class="badge '+(st==='paid'?'b-paid':st==='partial'?'b-partial':'b-unpaid')+'">'+invStatusLabel(st)+'</span>'; }
function lastReading(roomId, type){
  var list = db.meterReadings.filter(function(m){ return m.roomId===roomId && m.type===type; });
  list.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });
  return list.length? list[list.length-1] : null;
}
function nextPayDate(lc){
  if(!lc || !lc.payDay) return '';
  var t = today(), parts = t.split('-'), y = Number(parts[0]), m = Number(parts[1]);
  var cand = y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(lc.payDay,28)).padStart(2,'0');
  if(cand < t){ m++; if(m>12){ m=1; y++; } cand = y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(lc.payDay,28)).padStart(2,'0'); }
  return cand;
}

/* ---------- Điều hướng ---------- */
var NAVMAP = { dashboard:'dashboard', houses:'houses', houseForm:'houses', houseUtilities:'houses', utilityForm:'houses',
  rooms:'rooms', roomForm:'rooms', roomDetail:'rooms', deposits:'deposits', depositForm:'deposits',
  contracts:'contracts', contractForm:'contracts', contractDetail:'contracts', liquidate:'contracts', landlordContractForm:'contracts', landlordForm:'contracts',
  invoices:'invoices', invoiceDetail:'invoices', monthlyForm:'invoices', otherForm:'invoices', invoiceEdit:'invoices', invoicePrint:'invoices', paymentsAll:'invoices',
  finance:'finance', receiptForm:'finance', expenseForm:'finance', services:'services', serviceForm:'services',
  staff:'staff', staffForm:'staff', notifications:'notifications',
  vehicles:'manage', vehicleForm:'manage', assets:'manage', assetForm:'manage', incidents:'manage', incidentForm:'manage',
  customers:'manage', customerForm:'manage', units:'manage', settings:'manage' };
var curView = 'dashboard', curParams = {};
function toggleMenu(ev){ ev.stopPropagation(); document.getElementById('manageMenu').classList.toggle('open'); }
document.addEventListener('click', function(){ var m=document.getElementById('manageMenu'); if(m) m.classList.remove('open'); });
function go(view, params){
  curView = view; curParams = params || {};
  var fn = VIEWS[view];
  if(!fn){ toast('Màn hình chưa có: ' + view); return; }
  document.querySelectorAll('#mainNav [data-nav]').forEach(function(a){
    a.classList.toggle('on', a.getAttribute('data-nav') === (NAVMAP[view] || view));
  });
  document.getElementById('content').innerHTML = '<div class="loading">Đang tải...</div>';
  try { fn(curParams); } catch(e){ document.getElementById('content').innerHTML = '<div class="err-msg">Lỗi hiển thị: '+esc(e.message)+'</div>'; }
}
function setContent(html){ document.getElementById('content').innerHTML = html; }
function pageTitle(t){ return '<h2 class="page">'+esc(t)+'</h2>'; }
function tableHtml(cols, rowsHtml, emptyMsg){
  var h = '<div class="tblwrap"><table><thead><tr>' + cols.map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('') + '</tr></thead><tbody>';
  h += rowsHtml || ('<tr><td colspan="'+cols.length+'"><div class="empty-note">'+esc(emptyMsg||'Chưa có dữ liệu')+'</div></td></tr>');
  return h + '</tbody></table></div>';
}

/* ---------- Modal + Xóa phải xác thực mật khẩu ---------- */
function openModal(html){ document.getElementById('modalRoot').innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()"><div class="box">'+html+'</div></div>'; }
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }
function askDelete(label, onOk){
  openModal('<h3>Xác thực mật khẩu để xóa</h3>' +
    '<p style="color:#616161;font-size:14px">Bạn sắp xóa: <b>'+esc(label)+'</b>.<br>Nhập mật khẩu của bạn để xác nhận (theo thiết kế, thao tác Xóa cần xác thực mật khẩu).</p>' +
    '<label class="fl">Mật khẩu</label><input id="del_pw" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu của bạn">' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Hủy</button>' +
    '<button class="btn red" id="del_ok">Xóa</button></div>');
  document.getElementById('del_ok').onclick = function(){
    var pw = val('del_pw');
    if(!pw){ toast('Vui lòng nhập mật khẩu'); return; }
    this.disabled = true;
    api('/auth/verify-password', 'POST', { password: pw }).then(function(){
      closeModal(); onOk();
    }).catch(function(e){ document.getElementById('del_ok').disabled = false; errToast(e); });
  };
}
function delBtn(label, coll, id, after){
  askDelete(label, function(){
    deleteRecDirect(coll, id).then(function(){ toast('Đã xóa'); (after || function(){ go(curView, curParams); })(); }).catch(errToast);
  });
}

/* ================================================================
   0) ĐĂNG NHẬP
   ================================================================ */
function showLogin(errMsg){
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginRoot').innerHTML =
    '<div class="login-wrap"><form class="login-card" onsubmit="event.preventDefault();doLogin();">' +
    '<div class="login-logo">&#127968;</div><h2>Nhà Trọ Việt</h2>' +
    '<div class="login-sub">Đăng nhập hệ thống quản lý nhà trọ</div>' +
    (errMsg? '<div class="err-msg">'+esc(errMsg)+'</div>' : '') +
    fld('Số điện thoại', '<input id="lg_phone" type="tel" autocomplete="username" placeholder="VD: 0901234567">', true) +
    fld('Mật khẩu', '<div class="pw-wrap"><input id="lg_password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu">' +
      '<button type="button" class="pw-eye" onclick="togglePw(this)">&#128065;</button></div>', true) +
    '<button class="btn" id="lg_btn" type="submit">Đăng nhập</button>' +
    '<div class="login-hint">Tài khoản mẫu — Admin: 0901234567 / admin123<br>Nhân viên: 0901234568 / 123456</div></form></div>';
}
function togglePw(btn){ var i = btn.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; }
function doLogin(){
  var phone = val('lg_phone'), pw = document.getElementById('lg_password').value;
  var btn = document.getElementById('lg_btn'); btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  api('/auth/login', 'POST', { phone: phone, password: pw }).then(function(data){
    setToken(data.access_token); currentUser = data.user; bootApp();
  }).catch(function(e){ showLogin(e.message); });
}
function bootApp(){
  document.getElementById('loginRoot').innerHTML = '';
  document.getElementById('appRoot').style.display = '';
  document.getElementById('userName').textContent = currentUser ? (currentUser.name + ' (' + roleLabel(currentUser.role) + ')') : '';
  loadAll().then(function(){ go('dashboard'); }).catch(errToast);
}

/* ================================================================
   1) TỔNG QUAN
   ================================================================ */
function viewDashboard(){
  Promise.all([api('/dashboard'), api('/notifications')]).then(function(res){
    var d = res[0], notif = res[1];
    var expiring = db.contracts.filter(function(c){ return c.status==='active' && c.endDate && c.endDate >= today() && diffDays(today(), c.endDate) <= 30; });
    var h = pageTitle('Tổng quan');
    h += '<div class="hero"><div>Tiền sắp thu (còn lại của hóa đơn chưa thanh toán hết)</div><div class="big">'+fmt(d.upcomingPayments)+'</div>' +
         '<div>'+d.expiringContracts+' hợp đồng sắp hết hạn &bull; '+d.overdueInvoices+' hóa đơn quá hạn</div></div>';
    var stats = [
      ['emptyRooms','Phòng trống','rooms'],['deposits','Đang đặt cọc','deposits'],['openIncidents','Sự cố chưa xong','incidents'],
      ['unpaidInvoices','Hóa đơn chưa TT hết','invoices'],['notMeteredRooms','Chưa chốt điện nước tháng này','rooms'],
      ['expiringContracts','Sắp hết hạn hợp đồng','contracts'],['overdueInvoices','Quá hạn thanh toán','invoices'],['totalRooms','Tổng số phòng','rooms']];
    h += '<div class="grid-stats">' + stats.map(function(s){
      return '<div class="stat" onclick="go(\''+s[2]+'\')"><div class="num">'+d[s[0]]+'</div><div class="lbl">'+s[1]+'</div></div>';
    }).join('') + '</div>';
    h += '<h3 class="sec">Hợp đồng sắp hết hạn</h3>';
    h += tableHtml(['Phòng','Nhà','Khách thuê','Hết hạn','Còn (ngày)'], expiring.map(function(c,i){
      return '<tr><td>'+(i+1)+'. '+esc(roomName(c.roomId))+'</td><td>'+esc(houseName(c.houseId))+'</td><td>'+esc(customerName(c.customerId))+'</td><td>'+fmtDate(c.endDate)+'</td><td>'+diffDays(today(), c.endDate)+'</td></tr>';
    }).join(''), 'Không có hợp đồng nào sắp hết hạn');
    h += '<h3 class="sec">Thông báo mới nhất</h3>';
    var items = (notif.items || []).slice(0,5);
    h += items.length ? items.map(function(n){
      return '<div class="notif-item"><div class="time">'+esc(n.time)+'</div><div>'+esc(n.content)+'</div></div>';
    }).join('') : '<div class="empty-note">Chưa có thông báo</div>';
    h += '<div class="btnrow"><button class="btn sm" onclick="go(\'notifications\')">Xem tất cả thông báo</button></div>';
    setContent(h);
  }).catch(errToast);
}

var VIEWS = { dashboard: viewDashboard };

/* ================================================================
   2) NHÀ TRỌ — danh sách + form 3 phần + thanh toán điện nước
   ================================================================ */
var houseFilter = {};
function viewHouses(){
  var f = houseFilter;
  var provinces = [], districts = [], wards = [];
  db.houses.forEach(function(h){ if(h.province && provinces.indexOf(h.province)<0) provinces.push(h.province);
    if(h.district && districts.indexOf(h.district)<0) districts.push(h.district);
    if(h.ward && wards.indexOf(h.ward)<0) wards.push(h.ward); });
  var h = pageTitle('Danh sách nhà');
  h += '<div class="filters">' +
    '<div class="fg"><label>Tỉnh/TP</label>'+sel('hf_province', [['','Tất cả']].concat(provinces.map(function(x){return [x,x];})), f.province||'')+'</div>' +
    '<div class="fg"><label>Quận/Huyện</label>'+sel('hf_district', [['','Tất cả']].concat(districts.map(function(x){return [x,x];})), f.district||'')+'</div>' +
    '<div class="fg"><label>Phường/Xã</label>'+sel('hf_ward', [['','Tất cả']].concat(wards.map(function(x){return [x,x];})), f.ward||'')+'</div>' +
    '<div class="fg"><label>Tên nhà / địa chỉ</label>'+inp('hf_q', f.q||'', 'text', 'placeholder="Tìm..."')+'</div>' +
    '<div class="fg"><label>&nbsp;</label><span>'+chk('hf_soonpay','Sắp đến hạn thanh toán', f.soonpay)+'</span></div>' +
    '<div class="fg"><label>TT tiếp theo từ</label>'+inp('hf_payfrom', f.payfrom||'', 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp('hf_payto', f.payto||'', 'date')+'</div>' +
    '<div class="fg"><label>&nbsp;</label><span>'+chk('hf_soonend','Sắp hết hạn hợp đồng', f.soonend)+'</span></div>' +
    '<div class="fg"><label>Kết thúc HĐ từ</label>'+inp('hf_endfrom', f.endfrom||'', 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp('hf_endto', f.endto||'', 'date')+'</div>' +
    '<button class="btn" onclick="applyHouseFilter()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'houseForm\')">+ Thêm nhà</button>' +
       '<button class="btn" onclick="go(\'houseUtilities\')">Thanh toán điện nước</button></div>';
  var list = db.houses.filter(function(hs){
    var lc = landlordContractOf(hs.id);
    if(f.province && hs.province !== f.province) return false;
    if(f.district && hs.district !== f.district) return false;
    if(f.ward && hs.ward !== f.ward) return false;
    if(f.q && ((hs.name||'')+' '+hs.address).toLowerCase().indexOf(f.q.toLowerCase())<0) return false;
    var npd = nextPayDate(lc);
    if(f.soonpay && (!npd || diffDays(today(), npd) > 30 || diffDays(today(), npd) < 0)) return false;
    if(f.payfrom && (!npd || npd < f.payfrom)) return false;
    if(f.payto && (!npd || npd > f.payto)) return false;
    if(f.soonend && (!lc || !lc.endDate || diffDays(today(), lc.endDate) > 30 || diffDays(today(), lc.endDate) < 0)) return false;
    if(f.endfrom && (!lc || !lc.endDate || lc.endDate < f.endfrom)) return false;
    if(f.endto && (!lc || !lc.endDate || lc.endDate > f.endto)) return false;
    return true;
  });
  h += tableHtml(['STT','Tên nhà','Địa chỉ','Chủ nhà','SDT chủ nhà','Mã hợp đồng','Giá thuê nhà','Ngày TT tiếp theo','Ngày kết thúc HĐ',''], list.map(function(hs, i){
    var lc = landlordContractOf(hs.id);
    var ll = lc ? byId(db.landlords, lc.landlordId) : (hs.landlordId ? byId(db.landlords, hs.landlordId) : null);
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(hs.name || hs.address)+'</b></td><td>'+esc(hs.address)+'</td>' +
      '<td>'+esc(ll ? ll.name : '')+'</td><td>'+esc(ll ? ll.phone : '')+'</td><td>'+esc(lc ? (lc.code||'') : '')+'</td>' +
      '<td class="price">'+(lc ? fmt(lc.rentPrice) : '')+'</td><td>'+fmtDate(nextPayDate(lc))+'</td><td>'+(lc ? fmtDate(lc.endDate) : '')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'houseForm\',{id:\''+hs.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Nhà '+esc(hs.name || hs.address)+'\',\'houses\',\''+hs.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có nhà nào');
  setContent(h);
}
function applyHouseFilter(){
  houseFilter = { province: val('hf_province'), district: val('hf_district'), ward: val('hf_ward'), q: val('hf_q'),
    soonpay: isChk('hf_soonpay'), payfrom: val('hf_payfrom'), payto: val('hf_payto'),
    soonend: isChk('hf_soonend'), endfrom: val('hf_endfrom'), endto: val('hf_endto') };
  viewHouses();
}
function viewHouseForm(p){
  var hs = p.id ? byId(db.houses, p.id) : null;
  var lc = hs ? landlordContractOf(hs.id) : null;
  var ll = lc ? byId(db.landlords, lc.landlordId) : (hs && hs.landlordId ? byId(db.landlords, hs.landlordId) : null);
  var desc = hs ? (hs.description||'') : '', mapNote = '';
  if(desc.indexOf('Vị trí bản đồ: ') === 0){ var parts = desc.split('\n'); mapNote = parts[0].slice('Vị trí bản đồ: '.length); desc = parts.slice(1).join('\n'); }
  var h = pageTitle(hs ? 'Sửa nhà' : 'Thêm nhà');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveHouse(\''+(hs?hs.id:'')+'\')">' +
    '<div class="form-sec"><h3 class="sec" style="margin-top:0">Thông Tin Nhà</h3><div class="fgrid">' +
    fld('Tỉnh / TP', inp('h_province', hs?hs.province:'Hà Nội'), true) +
    fld('Quận / Huyện', inp('h_district', hs?hs.district:''), true) +
    fld('Phường / Xã', inp('h_ward', hs?hs.ward:''), true) +
    fld('Địa chỉ', inp('h_address', hs?hs.address:''), true) +
    fld('Tên nhà', inp('h_name', hs?hs.name:'')) +
    fld('Vị trí trên bản đồ (ghi chú)', inp('h_map', mapNote)) +
    fld('Diện tích sàn (m2)', inp('h_area', hs?hs.floorArea:0, 'number'), true) +
    fld('Số tầng', inp('h_floors', hs?hs.floors:1, 'number'), true) +
    fld('Số phòng ngủ', inp('h_bedrooms', hs?hs.bedrooms:0, 'number')) +
    fld('Số nhà vệ sinh', inp('h_bathrooms', hs?hs.bathrooms:0, 'number'), true) +
    fld('Loại nhà', sel('h_type', [['own','Nhà của mình'],['rented','Nhà thuê']], hs?hs.type:'own')) +
    fld('Loại hình kinh doanh', sel('h_business', ['Homestay','Chung cư mini','Phòng đơn','Phòng trọ'], hs?hs.businessType:'Phòng trọ'), true) +
    '</div>' + fld('Thêm mô tả', '<textarea id="h_desc">'+esc(desc)+'</textarea>') + '</div>' +
    '<div class="form-sec"><h3 class="sec">Chủ Nhà</h3>' +
    fld('Chọn chủ nhà có sẵn (để trống = nhập mới bên dưới)', selObj('h_landlordSel', db.landlords, ll?ll.id:'', function(l){ return l.name + ' — ' + l.phone; }, '-- Nhập chủ nhà mới --')) +
    '<div class="fgrid">' +
    fld('Họ tên chủ nhà', inp('l_name', ll?ll.name:'')) +
    fld('Ngày sinh', inp('l_dob', ll?ll.dob:'', 'date')) +
    fld('Địa chỉ thường trú', inp('l_perm', ll?ll.permanentAddress:'')) +
    fld('SDT', inp('l_phone', ll?ll.phone:'')) +
    fld('Giới tính', sel('l_gender', ['Nam','Nữ','Khác'], ll?ll.gender:'Nam')) +
    fld('Nghề nghiệp', inp('l_job', ll?ll.job:'')) +
    fld('Tình trạng hôn nhân', inp('l_marital', ll?ll.maritalStatus:'')) +
    fld('Mail', inp('l_email', ll?ll.email:'')) +
    fld('CMND/CCCD', inp('l_idcard', ll?ll.idCard:'')) +
    '</div></div>' +
    '<div class="form-sec"><h3 class="sec">Hợp Đồng (chỉ khi nhà thuê)</h3><div class="fgrid">' +
    fld('Tiền thuê (vnđ)', inp('lc_rent', lc?lc.rentPrice:0, 'number')) +
    fld('Cọc (vnđ)', inp('lc_deposit', lc?lc.deposit:0, 'number')) +
    fld('Ngày bắt đầu', inp('lc_start', lc?lc.startDate:'', 'date')) +
    fld('Ngày kết thúc', inp('lc_end', lc?lc.endDate:'', 'date')) +
    fld('Ngày thanh toán hàng tháng', inp('lc_payday', lc?lc.payDay:5, 'number')) +
    '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu nhà</button>' +
    '<button class="btn gray" type="button" onclick="go(\'houses\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveHouse(id){
  var landlordSel = val('h_landlordSel');
  var landlordData = null;
  if(!landlordSel && val('l_name')){
    landlordData = { name: val('l_name'), phone: val('l_phone'), address: val('l_perm'),
      dob: val('l_dob') || null, gender: val('l_gender'), job: val('l_job'),
      maritalStatus: val('l_marital'), email: val('l_email'), idCard: val('l_idcard'),
      permanentAddress: val('l_perm') };
  }
  var mapNote = val('h_map'), desc = val('h_desc');
  var fullDesc = (mapNote ? 'Vị trí bản đồ: ' + mapNote + '\n' : '') + desc;
  var proceed = function(landlordId){
    var data = { address: val('h_address'), name: val('h_name'), province: val('h_province'),
      district: val('h_district'), ward: val('h_ward'), floors: num(val('h_floors')),
      floorArea: num(val('h_area')), bedrooms: num(val('h_bedrooms')), bathrooms: num(val('h_bathrooms')),
      type: val('h_type'), businessType: val('h_business'), description: fullDesc,
      landlordId: landlordId || null };
    var saveContract = function(houseId){
      var rent = num(val('lc_rent'));
      if(data.type !== 'rented' || !rent){ toast('Đã lưu nhà'); go('houses'); return; }
      var lcData = { landlordId: landlordId, houseId: houseId, rentPrice: rent,
        deposit: num(val('lc_deposit')), startDate: val('lc_start') || null,
        endDate: val('lc_end') || null, payDay: num(val('lc_payday')) || 5, status: 'active' };
      var existed = id ? landlordContractOf(id) : null;
      var pr = existed ? updateRec('landlordContracts', existed.id, lcData) : createRec('landlordContracts', lcData);
      pr.then(function(){ toast('Đã lưu nhà + hợp đồng chủ nhà'); go('houses'); }).catch(errToast);
    };
    if(id) updateRec('houses', id, data).then(function(){ saveContract(id); }).catch(errToast);
    else createRec('houses', data).then(function(hs){ saveContract(hs.id); }).catch(errToast);
  };
  if(landlordData) createRec('landlords', landlordData).then(function(l){ proceed(l.id); }).catch(errToast);
  else proceed(landlordSel || null);
}

/* ----- Thanh toán điện nước của nhà (house_utilities) ----- */
var utilState = { tab:'dien', month:'', status:'', q:'', code:'', historyCode:null };
function viewHouseUtilities(){
  var st = utilState;
  var unpaidDien = db.houseUtilities.filter(function(u){ return u.type==='dien' && u.status!=='paid'; }).length;
  var unpaidNuoc = db.houseUtilities.filter(function(u){ return u.type==='nuoc' && u.status!=='paid'; }).length;
  var h = pageTitle('Thanh toán điện nước của nhà');
  h += '<div class="tabs"><span class="tab'+(st.tab==='dien'?' on':'')+'" onclick="utilState.tab=\'dien\';viewHouseUtilities()">Điện (Chưa thanh toán '+unpaidDien+')</span>' +
    '<span class="tab'+(st.tab==='nuoc'?' on':'')+'" onclick="utilState.tab=\'nuoc\';viewHouseUtilities()">Nước (Chưa thanh toán '+unpaidNuoc+')</span>' +
    '<span class="tab'+(st.tab==='lm'?' on':'')+'" onclick="utilState.tab=\'lm\';viewHouseUtilities()">Chốt điện nước chủ nhà</span></div>';
  if(st.tab === 'lm'){ setContent(h + landlordMeterHtml()); return; }
  var month = st.month || curMonth();
  h += '<div class="filters">' +
    '<div class="fg"><label>Địa chỉ / Tên nhà / mã</label>'+inp('uf_q', st.q, 'text', 'placeholder="Tìm..."')+'</div>' +
    '<div class="fg"><label>Mã '+(st.tab==='dien'?'điện':'nước')+'</label>'+inp('uf_code', st.code)+'</div>' +
    '<div class="fg"><label>Thời gian (tháng)</label>'+inp('uf_month', month, 'month')+'</div>' +
    '<div class="fg"><label>Trạng thái</label>'+sel('uf_status', [['','Tất cả'],['unpaid','Chưa thanh toán'],['paid','Đã thanh toán']], st.status)+'</div>' +
    '<button class="btn" onclick="applyUtilFilter()">Lọc</button>' +
    '<button class="btn green" onclick="go(\'utilityForm\',{type:\''+st.tab+'\'})">+ Thêm</button></div>';
  if(st.historyCode) h += '<div class="err-msg" style="background:#e3f2fd;color:#1565c0;border-color:#90caf9">Đang xem lịch sử của mã <b>'+esc(st.historyCode)+'</b> — <a onclick="utilState.historyCode=null;viewHouseUtilities()">xem tất cả</a></div>';
  var list = db.houseUtilities.filter(function(u){
    if(st.historyCode) return u.customerCode === st.historyCode;
    if(u.type !== st.tab) return false;
    if(st.status && u.status !== st.status) return false;
    if(st.code && (u.customerCode||'').indexOf(st.code) < 0) return false;
    if(month && u.month !== month) return false;
    if(st.q && ((houseName(u.houseId)+' '+houseAddr(u.houseId)+' '+(u.customerCode||'')).toLowerCase().indexOf(st.q.toLowerCase())<0)) return false;
    return true;
  });
  h += tableHtml(['STT','Tên nhà','Địa chỉ','Mã '+(st.tab==='dien'?'Điện':'Nước'),'Chủ tài khoản','Tài Khoản','Mật khẩu','Thời gian','Tiền thanh toán','Trạng thái',''], list.map(function(u, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(houseName(u.houseId))+'</b></td><td>'+esc(houseAddr(u.houseId))+'</td><td>'+esc(u.customerCode)+'</td>' +
      '<td>'+esc(u.accountHolder)+'</td><td>'+esc(u.username)+'</td><td>'+esc(u.password)+'</td><td>'+esc(u.month)+'</td>' +
      '<td class="price">'+fmt(u.amount)+'</td><td>'+(u.status==='paid' ? '<span class="badge b-paid">Đã thanh toán</span>' : '<span class="badge b-unpaid">Chưa thanh toán</span>')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="utilState.historyCode=\''+esc(u.customerCode)+'\';viewHouseUtilities()">Lịch sử</button>' +
      (u.status!=='paid' ? '<button class="linkbtn" onclick="payUtility(\''+u.id+'\')">Thanh toán</button>' : '') +
      '<button class="linkbtn" onclick="go(\'utilityForm\',{id:\''+u.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Bản ghi điện nước '+(u.customerCode||'')+'\',\'houseUtilities\',\''+u.id+'\',function(){viewHouseUtilities();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có dữ liệu điện nước');
  setContent(h);
}
function applyUtilFilter(){ utilState.q = val('uf_q'); utilState.code = val('uf_code'); utilState.month = val('uf_month'); utilState.status = val('uf_status'); utilState.historyCode = null; viewHouseUtilities(); }
function payUtility(id){
  api('/house-utilities/' + id + '/pay', 'POST', {}).then(function(r){
    var u = byId(db.houseUtilities, id); if(u) u.status = 'paid';
    return loadColl('expenses');
  }).then(function(){ toast('Đã thanh toán — phiếu chi đã được tạo tự động'); viewHouseUtilities(); }).catch(errToast);
}
function viewUtilityForm(p){
  var u = p.id ? byId(db.houseUtilities, p.id) : null;
  var h = pageTitle(u ? 'Sửa bản ghi điện nước' : 'Thêm bản ghi điện nước');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveUtility(\''+(u?u.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('u_house', db.houses, u?u.houseId:'', function(x){ return (x.name||x.address); }), true) +
    fld('Loại', sel('u_type', [['dien','Điện'],['nuoc','Nước']], u?u.type:(p.type||'dien'))) +
    fld('Mã điện / Mã nước', inp('u_code', u?u.customerCode:''), true) +
    fld('Chủ tài khoản', inp('u_holder', u?u.accountHolder:'')) +
    fld('Tài khoản', inp('u_username', u?u.username:'')) +
    fld('Mật khẩu', inp('u_password', u?u.password:'')) +
    fld('Tháng', inp('u_month', u?u.month:curMonth(), 'month')) +
    fld('Tiền thanh toán (vnđ)', inp('u_amount', u?u.amount:0, 'number')) +
    fld('Trạng thái', sel('u_status', [['unpaid','Chưa thanh toán'],['paid','Đã thanh toán']], u?u.status:'unpaid')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'houseUtilities\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveUtility(id){
  var data = { houseId: val('u_house'), type: val('u_type'), customerCode: val('u_code'),
    accountHolder: val('u_holder'), username: val('u_username'), password: val('u_password'),
    month: val('u_month'), amount: num(val('u_amount')), status: val('u_status') };
  var pr = id ? updateRec('houseUtilities', id, data) : createRec('houseUtilities', data);
  pr.then(function(){ toast('Đã lưu'); go('houseUtilities'); }).catch(errToast);
}
function landlordMeterHtml(){
  var h = '<div class="btnrow"><button class="btn green" onclick="go(\'utilityForm\',{lm:1})">+ Chốt điện nước chủ nhà</button></div>';
  h += tableHtml(['STT','Nhà','Ngày chốt','Tiền điện','Tiền nước','Internet','Vệ sinh','Tổng',''], db.landlordMeterReadings.map(function(m, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(m.houseId))+'</td><td>'+fmtDate(m.date)+'</td><td>'+fmt(m.dien)+'</td><td>'+fmt(m.nuoc)+'</td><td>'+fmt(m.internet)+'</td><td>'+fmt(m.vesinh)+'</td><td class="price">'+fmt(m.total)+'</td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Bản ghi chốt ĐN chủ nhà\',\'landlordMeterReadings\',\''+m.id+'\',function(){viewHouseUtilities();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có lần chốt nào');
  return h;
}
VIEWS.houses = viewHouses; VIEWS.houseForm = viewHouseForm;
VIEWS.houseUtilities = viewHouseUtilities;
VIEWS.utilityForm = function(p){
  if(p.lm){ /* form chốt điện nước chủ nhà */
    var h = pageTitle('Chốt điện nước chủ nhà');
    h += '<form class="form-card" onsubmit="event.preventDefault();saveLandlordMeter()"><div class="fgrid">' +
      fld('Nhà', selObj('lm_house', db.houses, '', function(x){ return (x.name||x.address); }), true) +
      fld('Ngày chốt', inp('lm_date', today(), 'date')) +
      fld('Tiền điện (vnđ)', inp('lm_dien', 0, 'number')) + fld('Tiền nước (vnđ)', inp('lm_nuoc', 0, 'number')) +
      fld('Tiền internet (vnđ)', inp('lm_internet', 0, 'number')) + fld('Vệ sinh (vnđ)', inp('lm_vesinh', 0, 'number')) +
      '</div><div class="btnrow"><button class="btn green" type="submit">Lưu (tổng tự tính)</button>' +
      '<button class="btn gray" type="button" onclick="go(\'houseUtilities\')">Quay lại</button></div></form>';
    setContent(h); return;
  }
  viewUtilityForm(p);
};
function saveLandlordMeter(){
  createRec('landlordMeterReadings', { houseId: val('lm_house'), date: val('lm_date') || null,
    dien: num(val('lm_dien')), nuoc: num(val('lm_nuoc')), internet: num(val('lm_internet')), vesinh: num(val('lm_vesinh')) })
    .then(function(){ toast('Đã lưu chốt điện nước chủ nhà'); utilState.tab='lm'; go('houseUtilities'); }).catch(errToast);
}

/* ================================================================
   3) PHÒNG TRỌ — tab đếm số, lọc, bảng, import/export CSV
   ================================================================ */
var ROOM_TYPES = ['Chung cư mini','Homestay','Phòng trọ','Phòng đơn','Studio','1 ngủ 1 khách','2 ngủ 1 khách','Khép kín','Không khép kín'];
var AMENITIES = ['Điều hòa','Nóng lạnh','Máy giặt','Tivi','Ban công','Cửa sổ','Sân phơi','Gác xép','Thang máy','Camera','Bảo vệ','Internet','Có chỗ để xe máy','Có chỗ để ô tô','Có chỗ để sạc xe điện'];
var roomFilter = { tab:'all' };
function roomCounts(){
  var c = { all: db.rooms.length, empty:0, deposited:0, rented:0, expiring:0 };
  db.rooms.forEach(function(r){ var st = roomStatus(r); c[st]++;
    var ct = activeContract(r.id); if(ct && ct.endDate && ct.endDate >= today() && diffDays(today(), ct.endDate) <= 30) c.expiring++; });
  return c;
}
function viewRooms(){
  var f = roomFilter, c = roomCounts();
  var h = pageTitle('Danh sách phòng');
  var tabs = [['all','Tất cả',c.all],['empty','Trống',c.empty],['deposited','Đã cọc',c.deposited],['rented','Đã thuê',c.rented],['expiring','Sắp hết hợp đồng',c.expiring]];
  h += '<div class="tabs">' + tabs.map(function(t){
    return '<span class="tab'+(f.tab===t[0]?' on':'')+'" onclick="roomFilter.tab=\''+t[0]+'\';viewRooms()">'+t[1]+' ('+t[2]+')</span>';
  }).join('') + '</div>';
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('rf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Tên phòng</label>'+inp('rf_q', f.q||'', 'text', 'placeholder="Tìm..."')+'</div>' +
    '<div class="fg"><label>Loại phòng</label>'+sel('rf_type', [['','Tất cả']].concat(ROOM_TYPES.map(function(x){return [x,x];})), f.type||'')+'</div>' +
    '<div class="fg"><label>Giá từ</label>'+inp('rf_pmin', f.pmin||'', 'number')+'</div>' +
    '<div class="fg"><label>Giá đến</label>'+inp('rf_pmax', f.pmax||'', 'number')+'</div>' +
    '<div class="fg"><label>Số người tối đa ≥</label>'+inp('rf_ppl', f.ppl||'', 'number')+'</div>' +
    '<div class="fg"><label>Tiện ích</label><span>' +
      ['Điều hòa','Nóng lạnh','Máy giặt','Tivi','Ban công','Cửa sổ'].map(function(a){ return chk('rf_am_'+a, a, (f.amenities||[]).indexOf(a)>=0); }).join('') +
      chk('rf_am_park', 'Chỗ gửi xe', (f.amenities||[]).indexOf('__park')>=0) + '</span></div>' +
    '<button class="btn" onclick="applyRoomFilter()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'roomForm\')">+ Thêm phòng</button>' +
    '<button class="btn" onclick="document.getElementById(\'csvFile\').click()">Thêm phòng bằng file</button>' +
    '<input type="file" id="csvFile" accept=".csv" style="display:none" onchange="importRoomsCsv(this)">' +
    '<button class="btn gray" onclick="downloadSampleCsv()">Tải file mẫu CSV</button>' +
    '<button class="btn gray" onclick="exportRoomsCsv()">Tải file danh sách phòng</button></div>';
  var list = filteredRooms();
  h += tableHtml(['STT','Tên nhà','Tầng','Tên phòng','Cọc','Giá phòng','Diện tích','Loại phòng','Trạng thái','Chung chủ','Vệ sinh','Gác xép','Bếp','Số người tối đa','Dịch vụ',''], list.map(function(r, i){
    var sv = r.services || {};
    var svTxt = Object.keys(sv).filter(function(k){ return k!=='extra' && sv[k]; }).map(function(k){
      return {dien:'Điện',dienChung:'Điện chung',internet:'Internet',nuoc:'Nước'}[k] || k; }).join(', ');
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(r.houseId))+'</td><td>'+r.floor+'</td>' +
      '<td><a onclick="go(\'roomDetail\',{id:\''+r.id+'\'})"><b>'+esc(r.name)+'</b></a></td>' +
      '<td>'+fmt(r.minDeposit)+'</td><td class="price">'+fmt(r.price)+'</td><td>'+r.area+' m2</td><td>'+esc(r.type)+'</td>' +
      '<td>'+statusBadge(roomStatus(r))+'</td><td>'+(r.withOwner?'Có':'Không')+'</td><td>'+esc(r.toilet)+'</td>' +
      '<td>'+((r.amenities||[]).indexOf('Gác xép')>=0?'Có':'Không')+'</td><td>'+esc(r.kitchen||'Không có')+'</td><td>'+r.maxPeople+'</td><td>'+esc(svTxt)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'roomForm\',{id:\''+r.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Phòng '+esc(r.name)+'\',\'rooms\',\''+r.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có phòng nào');
  setContent(h);
}
function filteredRooms(){
  var f = roomFilter;
  return db.rooms.filter(function(r){
    var st = roomStatus(r);
    if(f.tab==='empty' && st!=='empty') return false;
    if(f.tab==='deposited' && st!=='deposited') return false;
    if(f.tab==='rented' && st!=='rented') return false;
    if(f.tab==='expiring'){ var ct = activeContract(r.id); if(!ct || !ct.endDate || ct.endDate < today() || diffDays(today(), ct.endDate) > 30) return false; }
    if(f.houseId && r.houseId !== f.houseId) return false;
    if(f.q && r.name.toLowerCase().indexOf(f.q.toLowerCase())<0) return false;
    if(f.type && r.type !== f.type) return false;
    if(f.pmin && r.price < num(f.pmin)) return false;
    if(f.pmax && r.price > num(f.pmax)) return false;
    if(f.ppl && r.maxPeople < num(f.ppl)) return false;
    var ams = f.amenities || [];
    for(var i=0;i<ams.length;i++){
      if(ams[i]==='__park'){ if(!(r.amenities||[]).some(function(a){ return a.indexOf('để xe')>=0; })) return false; }
      else if((r.amenities||[]).indexOf(ams[i])<0) return false;
    }
    return true;
  });
}
function applyRoomFilter(){
  var ams = ['Điều hòa','Nóng lạnh','Máy giặt','Tivi','Ban công','Cửa sổ'].filter(function(a){ return isChk('rf_am_'+a); });
  if(isChk('rf_am_park')) ams.push('__park');
  roomFilter.houseId = val('rf_house'); roomFilter.q = val('rf_q'); roomFilter.type = val('rf_type');
  roomFilter.pmin = val('rf_pmin'); roomFilter.pmax = val('rf_pmax'); roomFilter.ppl = val('rf_ppl');
  roomFilter.amenities = ams; viewRooms();
}
function csvCell(v){ v = String(v==null?'':v); return v.indexOf(',')>=0 || v.indexOf('"')>=0 ? '"'+v.replace(/"/g,'""')+'"' : v; }
function downloadSampleCsv(){
  var rows = [['name','floor','area','type','toilet','kitchen','price','minDeposit','maxPeople'],
    ['Phòng 301',3,30,'Phòng trọ','Khép kín','Trong phòng',3000000,3000000,3]];
  downloadText('mau-them-phong.csv', rows.map(function(r){ return r.map(csvCell).join(','); }).join('\n'));
}
function exportRoomsCsv(){
  var rows = [['Tên nhà','Tầng','Tên phòng','Cọc','Giá phòng','Diện tích','Loại phòng','Trạng thái','Chung chủ','Vệ sinh','Gác xép','Bếp','Số người tối đa']];
  filteredRooms().forEach(function(r){
    rows.push([houseName(r.houseId), r.floor, r.name, r.minDeposit, r.price, r.area, r.type,
      invStatusLabel2(roomStatus(r)), r.withOwner?'Có':'Không', r.toilet,
      (r.amenities||[]).indexOf('Gác xép')>=0?'Có':'Không', r.kitchen||'', r.maxPeople]);
  });
  downloadText('danh-sach-phong.csv', rows.map(function(r){ return r.map(csvCell).join(','); }).join('\n'));
}
function invStatusLabel2(st){ return st==='rented' ? 'Đã thuê' : (st==='deposited' ? 'Đã cọc' : 'Trống'); }
function downloadText(name, text){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type:'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
}
function importRoomsCsv(input){
  var file = input.files && input.files[0]; if(!file) return;
  var houseId = roomFilter.houseId;
  if(!houseId){ toast('Hãy chọn 1 nhà ở bộ lọc trước khi import'); input.value=''; return; }
  file.text().then(function(text){
    var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); });
    if(lines.length < 2){ toast('File trống'); return; }
    var heads = lines[0].split(',').map(function(x){ return x.trim(); });
    var jobs = [];
    for(var i=1;i<lines.length;i++){
      var cells = lines[i].split(',').map(function(x){ return x.trim().replace(/^"|"$/g,''); });
      var rec = {}; heads.forEach(function(hd, j){ rec[hd] = cells[j]; });
      jobs.push(createRec('rooms', { houseId: houseId, name: rec.name || ('Phòng ' + i),
        floor: num(rec.floor)||1, area: num(rec.area), type: rec.type || 'Phòng trọ',
        toilet: rec.toilet || 'Khép kín', kitchen: rec.kitchen || 'Không có', withOwner: false,
        price: num(rec.price), minDeposit: num(rec.minDeposit || rec.price), maxPeople: num(rec.maxPeople),
        payMonths: 1, payFromDay: 1, payToDay: 3, amenities: [], services: {} }));
    }
    Promise.all(jobs).then(function(){ toast('Đã thêm ' + jobs.length + ' phòng từ file'); viewRooms(); }).catch(errToast);
    input.value = '';
  });
}
function viewRoomForm(p){
  var r = p.id ? byId(db.rooms, p.id) : null;
  var sv = r ? (r.services || {}) : {};
  var h = pageTitle(r ? 'Sửa phòng' : 'Thêm phòng');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveRoom(\''+(r?r.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('r_house', db.houses, r?r.houseId:(roomFilter.houseId||''), function(x){ return (x.name||x.address); }), true) +
    fld('Tên phòng', inp('r_name', r?r.name:''), true) +
    fld('Tầng', inp('r_floor', r?r.floor:1, 'number')) +
    fld('Diện tích (m2)', inp('r_area', r?r.area:0, 'number')) +
    fld('Loại phòng', sel('r_type', ROOM_TYPES, r?r.type:'Phòng trọ')) +
    fld('Vệ sinh', sel('r_toilet', ['Khép kín','Riêng','Chung'], r?r.toilet:'Khép kín')) +
    fld('Bếp', sel('r_kitchen', ['Trong phòng','Bên ngoài','Chung','Không có'], r?r.kitchen:'Không có')) +
    fld('Giá phòng (vnđ)', inp('r_price', r?r.price:0, 'number'), true) +
    fld('Cọc tối thiểu (vnđ)', inp('r_minDep', r?r.minDeposit:0, 'number')) +
    fld('Số người ở tối đa', inp('r_max', r?r.maxPeople:0, 'number')) +
    fld('Số tháng thanh toán 1 lần', inp('r_payMonths', r?r.payMonths:1, 'number')) +
    fld('Thanh toán từ ngày', inp('r_from', r?r.payFromDay:1, 'number')) +
    fld('đến ngày', inp('r_to', r?r.payToDay:3, 'number')) +
    '</div><label class="fl"><input type="checkbox" id="r_withOwner" style="width:auto"'+(r&&r.withOwner?' checked':'')+'> Chung chủ</label>' +
    '<h3 class="sec">Tiện ích</h3><div>' + AMENITIES.map(function(a){
      return chk('r_am_'+a, a, r && (r.amenities||[]).indexOf(a)>=0);
    }).join('') + '</div>' +
    '<h3 class="sec">Dịch vụ của phòng (giá mặc định khi tạo hợp đồng)</h3><div class="fgrid">' +
    fld('Giá điện (vnđ/số)', inp('r_sv_dien', typeof sv.dien==='number'?sv.dien:(sv.dien?sv.dien.price:3000), 'number')) +
    fld('Điện chung (vnđ/người)', inp('r_sv_dc', typeof sv.dienChung==='number'?sv.dienChung:(sv.dienChung?sv.dienChung.price:30000), 'number')) +
    fld('Internet (vnđ/người)', inp('r_sv_net', typeof sv.internet==='number'?sv.internet:(sv.internet?sv.internet.price:50000), 'number')) +
    '</div>';
  if(r){
    var assets = db.assets.filter(function(a){ return a.roomId === r.id; });
    h += '<h3 class="sec">Tài sản của phòng</h3>' + tableHtml(['Mã TS','Loại','Trạng thái'], assets.map(function(a){
      return '<tr><td>'+esc(a.code)+'</td><td>'+esc(a.type)+'</td><td>'+esc(a.status)+'</td></tr>';
    }).join(''), 'Phòng chưa có tài sản') ;
  }
  h += '<div class="btnrow"><button class="btn green" type="submit">Lưu phòng</button>' +
    '<button class="btn gray" type="button" onclick="go(\'rooms\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveRoom(id){
  var amenities = AMENITIES.filter(function(a){ return isChk('r_am_'+a); });
  var data = { houseId: val('r_house'), name: val('r_name'), floor: num(val('r_floor')),
    area: num(val('r_area')), type: val('r_type'), toilet: val('r_toilet'), kitchen: val('r_kitchen'),
    withOwner: isChk('r_withOwner'), price: num(val('r_price')), minDeposit: num(val('r_minDep')),
    maxPeople: num(val('r_max')), payMonths: num(val('r_payMonths'))||1,
    payFromDay: num(val('r_from'))||1, payToDay: num(val('r_to'))||3, amenities: amenities,
    services: { dien: num(val('r_sv_dien')), dienChung: num(val('r_sv_dc')), internet: num(val('r_sv_net')), extra: [] } };
  var pr = id ? updateRec('rooms', id, data) : createRec('rooms', data);
  pr.then(function(){ toast('Đã lưu phòng'); go('rooms'); }).catch(errToast);
}
function viewRoomDetail(p){
  var r = byId(db.rooms, p.id); if(!r){ toast('Không tìm thấy phòng'); go('rooms'); return; }
  var ct = activeContract(r.id);
  var assets = db.assets.filter(function(a){ return a.roomId === r.id; });
  var readings = db.meterReadings.filter(function(m){ return m.roomId === r.id; });
  var h = pageTitle(esc(r.name) + ' — ' + esc(houseName(r.houseId)));
  h += '<div class="card">' +
    '<div class="kv"><span>Trạng thái</span><span>'+statusBadge(roomStatus(r))+'</span></div>' +
    '<div class="kv"><span>Giá phòng / Cọc tối thiểu</span><span>'+fmt(r.price)+' / '+fmt(r.minDeposit)+'</span></div>' +
    '<div class="kv"><span>Tầng / Diện tích / Loại</span><span>'+r.floor+' / '+r.area+' m2 / '+esc(r.type)+'</span></div>' +
    '<div class="kv"><span>Vệ sinh / Bếp / Chung chủ</span><span>'+esc(r.toilet)+' / '+esc(r.kitchen||'Không có')+' / '+(r.withOwner?'Có':'Không')+'</span></div>' +
    '<div class="kv"><span>Tiện ích</span><span>'+esc((r.amenities||[]).join(', ') || '—')+'</span></div>' +
    (ct ? '<div class="kv"><span>Hợp đồng</span><span>'+esc(ct.code||'')+' — '+esc(customerName(ct.customerId))+' ('+fmtDate(ct.startDate)+' → '+fmtDate(ct.endDate)+')</span></div>' : '') +
    '</div>';
  h += '<div class="btnrow">' +
    (ct ? '<button class="btn" onclick="go(\'contractDetail\',{id:\''+ct.id+'\'})">Xem hợp đồng</button>'
        : '<button class="btn green" onclick="go(\'contractForm\',{roomId:\''+r.id+'\'})">Tạo hợp đồng</button>') +
    '<button class="btn" onclick="quickMonthly(\''+r.id+'\')">Tạo hóa đơn tháng này</button>' +
    '<button class="btn gray" onclick="go(\'roomForm\',{id:\''+r.id+'\'})">Sửa phòng</button>' +
    '<button class="btn gray" onclick="go(\'rooms\')">Quay lại</button></div>';
  h += '<h3 class="sec">Tài sản của phòng</h3>' + tableHtml(['Mã TS','Loại','Trạng thái'], assets.map(function(a){
    return '<tr><td>'+esc(a.code)+'</td><td>'+esc(a.type)+'</td><td>'+esc(a.status)+'</td></tr>'; }).join(''), 'Chưa có tài sản');
  h += '<h3 class="sec">Chốt số điện / nước</h3><div class="card">' +
    '<div class="fgrid">' + fld('Loại', sel('mr_type', [['dien','Điện'],['nuoc','Nước']], 'dien')) +
    fld('Chỉ số mới', inp('mr_curr', '', 'number')) + fld('Ngày chốt', inp('mr_date', today(), 'date')) + '</div>' +
    '<div class="btnrow"><button class="btn" onclick="saveReading(\''+r.id+'\',\''+r.houseId+'\')">Lưu chốt số</button></div>' +
    tableHtml(['Loại','Chỉ số đầu','Chỉ số cuối','Ngày'], readings.map(function(m){
      return '<tr><td>'+(m.type==='dien'?'Điện':'Nước')+'</td><td>'+m.prev+'</td><td>'+m.current+'</td><td>'+fmtDate(m.date)+'</td></tr>';
    }).join(''), 'Chưa chốt lần nào') + '</div>';
  setContent(h);
}
function saveReading(roomId, houseId){
  var type = val('mr_type'), curr = num(val('mr_curr'));
  var last = lastReading(roomId, type);
  createRec('meterReadings', { houseId: houseId, roomId: roomId, type: type,
    prev: last ? last.current : 0, current: curr, date: val('mr_date') || today(), note: '' })
    .then(function(){ toast('Đã chốt số'); go('roomDetail', { id: roomId }); }).catch(errToast);
}
function quickMonthly(roomId){
  if(!activeContract(roomId)){ toast('Phòng chưa có hợp đồng đang hiệu lực'); return; }
  api('/invoices/monthly', 'POST', { roomId: roomId, month: curMonth() }).then(function(inv){
    return loadColl('invoices').then(function(){ toast('Đã tạo hóa đơn ' + (inv.code||'')); go('invoiceDetail', { id: inv.id }); });
  }).catch(errToast);
}
VIEWS.rooms = viewRooms; VIEWS.roomForm = viewRoomForm; VIEWS.roomDetail = viewRoomDetail;

/* ================================================================
   4) CỌC PHÒNG
   ================================================================ */
var depFilter = {};
function viewDeposits(){
  var f = depFilter;
  var h = pageTitle('Danh sách cọc phòng');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('df_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng</label>'+selObj('df_room', db.rooms, f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<button class="btn" onclick="depFilter={houseId:val(\'df_house\'),roomId:val(\'df_room\')};viewDeposits()">Lọc</button>' +
    '<button class="btn green" onclick="go(\'depositForm\')">+ Thêm cọc</button></div>';
  var list = db.deposits.filter(function(d){
    if(f.houseId && d.houseId !== f.houseId) return false;
    if(f.roomId && d.roomId !== f.roomId) return false;
    return true;
  });
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Tên phòng','Giá phòng','Giá thuê','Tiền giữ phòng','Trống phòng (ngày)','Ngày vào','Ngày ra','Ngày cọc','Ngày đến làm HĐ','Ngày hết hạn cọc',''], list.map(function(d, i){
    var room = byId(db.rooms, d.roomId);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(d.code||'')+'</td><td>'+esc(houseName(d.houseId))+'</td><td>'+esc(roomName(d.roomId))+'</td>' +
      '<td>'+fmt(room ? room.price : 0)+'</td><td>'+fmt(d.rentPrice)+'</td><td class="price">'+fmt(d.amount)+'</td><td>'+(d.vacantDays||0)+'</td>' +
      '<td>'+fmtDate(d.moveInDate)+'</td><td>'+fmtDate(d.moveOutDate)+'</td><td>'+fmtDate(d.date)+'</td><td>'+fmtDate(d.contractDate)+'</td><td>'+fmtDate(d.expiryDate)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'depositForm\',{id:\''+d.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Cọc phòng '+esc(roomName(d.roomId))+'\',\'deposits\',\''+d.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có đặt cọc nào');
  setContent(h);
}
function viewDepositForm(p){
  var d = p.id ? byId(db.deposits, p.id) : null;
  var room = d ? byId(db.rooms, d.roomId) : null;
  var h = pageTitle(d ? 'Sửa cọc phòng' : 'Thêm cọc phòng');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveDeposit(\''+(d?d.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('dp_house', db.houses, d?d.houseId:'', function(x){ return (x.name||x.address); }), true) +
    fld('Phòng', selObj('dp_room', db.rooms, d?d.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }), true) +
    fld('Mã HĐ cọc (để trống = tự sinh)', inp('dp_code', d?d.code:'')) +
    fld('Tên khách cọc', inp('dp_cust', d?d.customerName:''), true) +
    fld('SDT khách', inp('dp_phone', d?d.phone:'')) +
    fld('Giá thuê (vnđ)', inp('dp_rent', d?d.rentPrice:(room?room.price:0), 'number')) +
    fld('Tiền giữ phòng (vnđ)', inp('dp_amount', d?d.amount:0, 'number'), true) +
    fld('Thời gian trống phòng (ngày)', inp('dp_vacant', d?d.vacantDays:0, 'number')) +
    fld('Ngày cọc', inp('dp_date', d?d.date:today(), 'date')) +
    fld('Ngày vào', inp('dp_in', d?d.moveInDate:'', 'date')) +
    fld('Ngày ra', inp('dp_out', d?d.moveOutDate:'', 'date')) +
    fld('Ngày đến làm hợp đồng', inp('dp_contract', d?d.contractDate:'', 'date')) +
    fld('Ngày hết hạn cọc', inp('dp_expiry', d?d.expiryDate:'', 'date')) +
    '</div>' + fld('Ghi chú', '<textarea id="dp_note">'+esc(d?d.note:'')+'</textarea>') +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu cọc</button>' +
    '<button class="btn gray" type="button" onclick="go(\'deposits\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveDeposit(id){
  var room = byId(db.rooms, val('dp_room'));
  var data = { houseId: room ? room.houseId : val('dp_house'), roomId: val('dp_room'), code: val('dp_code'),
    customerName: val('dp_cust'), phone: val('dp_phone'), amount: num(val('dp_amount')),
    rentPrice: num(val('dp_rent')), vacantDays: num(val('dp_vacant')),
    date: val('dp_date') || null, moveInDate: val('dp_in') || null, moveOutDate: val('dp_out') || null,
    contractDate: val('dp_contract') || null, expiryDate: val('dp_expiry') || null, note: val('dp_note') };
  var pr = id ? updateRec('deposits', id, data) : createRec('deposits', data);
  pr.then(function(){ toast('Đã lưu cọc'); go('deposits'); }).catch(errToast);
}
VIEWS.deposits = viewDeposits; VIEWS.depositForm = viewDepositForm;

/* ================================================================
   5) HỢP ĐỒNG — thuê phòng + hợp đồng chủ nhà + thanh lý
   ================================================================ */
var contractState = { tab:'all', sub:'tenant', houseId:'' };
function contractSigned(c){ return !!c.signDate && c.status === 'active'; }
function viewContracts(){
  var st = contractState;
  var h = pageTitle('Hợp đồng');
  h += '<div class="tabs"><span class="tab'+(st.sub==='tenant'?' on':'')+'" onclick="contractState.sub=\'tenant\';viewContracts()">Hợp đồng thuê phòng</span>' +
    '<span class="tab'+(st.sub==='landlord'?' on':'')+'" onclick="contractState.sub=\'landlord\';viewContracts()">Hợp đồng chủ nhà</span></div>';
  if(st.sub === 'landlord'){ setContent(h + landlordContractsHtml()); return; }
  var counts = { all: db.contracts.length, signed:0, unsigned:0, expiring:0 };
  db.contracts.forEach(function(c){ if(contractSigned(c)) counts.signed++; else if(c.status==='active') counts.unsigned++;
    if(c.status==='active' && c.endDate && c.endDate >= today() && diffDays(today(), c.endDate) <= 30) counts.expiring++; });
  var tabs = [['all','Tất cả',counts.all],['signed','Đã ký',counts.signed],['unsigned','Chưa ký',counts.unsigned],['expiring','Sắp hết hạn',counts.expiring]];
  h += '<div class="tabs">' + tabs.map(function(t){
    return '<span class="tab'+(st.tab===t[0]?' on':'')+'" onclick="contractState.tab=\''+t[0]+'\';viewContracts()">'+t[1]+' ('+t[2]+')</span>'; }).join('') + '</div>';
  h += '<div class="filters"><div class="fg"><label>Nhà</label>'+selObj('cf_house', db.houses, st.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<button class="btn" onclick="contractState.houseId=val(\'cf_house\');viewContracts()">Lọc</button>' +
    '<button class="btn green" onclick="go(\'contractForm\')">+ Thêm Hợp Đồng</button></div>';
  var list = db.contracts.filter(function(c){
    if(st.houseId && c.houseId !== st.houseId) return false;
    if(st.tab==='signed' && !contractSigned(c)) return false;
    if(st.tab==='unsigned' && !(c.status==='active' && !contractSigned(c))) return false;
    if(st.tab==='expiring' && !(c.status==='active' && c.endDate && c.endDate >= today() && diffDays(today(), c.endDate) <= 30)) return false;
    return true;
  });
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Tên phòng','Người đại diện','SĐT','Giá thuê','Số người','Thời gian thuê','Trạng thái',''], list.map(function(c, i){
    var cust = byId(db.customers, c.customerId);
    var label = c.status==='liquidated' ? '<span class="badge b-gray">Đã thanh lý</span>'
      : (contractSigned(c) ? (c.endDate && c.endDate >= today() && diffDays(today(), c.endDate) <= 30 ? '<span class="badge b-deposited">Sắp hết hạn</span>' : '<span class="badge b-paid">Đã ký</span>') : '<span class="badge b-unpaid">Chưa ký</span>');
    return '<tr><td>'+(i+1)+'</td><td>'+esc(c.code||'')+'</td><td>'+esc(houseName(c.houseId))+'</td><td>'+esc(roomName(c.roomId))+'</td>' +
      '<td>'+esc(cust ? cust.name : '')+'</td><td>'+esc(cust ? cust.phone : '')+'</td><td class="price">'+fmt(c.price)+'</td><td>'+c.people+'</td>' +
      '<td>'+fmtDate(c.startDate)+' → '+fmtDate(c.endDate)+'</td><td>'+label+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'contractDetail\',{id:\''+c.id+'\'})">Chi tiết</button>' +
      (c.status==='active' ? '<button class="linkbtn" onclick="go(\'liquidate\',{id:\''+c.id+'\'})">Thanh lý</button>' : '') +
      '<button class="linkbtn red" onclick="delBtn(\'Hợp đồng '+esc(c.code||roomName(c.roomId))+'\',\'contracts\',\''+c.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có hợp đồng nào');
  setContent(h);
}
function viewContractForm(p){
  var room = p.roomId ? byId(db.rooms, p.roomId) : (db.rooms[0] || null);
  var rsv = room ? (room.services || {}) : {};
  function svNum(v, dft){ return typeof v === 'number' ? v : (v && v.price !== undefined ? v.price : dft); }
  var h = pageTitle('Thêm hợp đồng');
  h += '<p style="color:#616161;margin-bottom:10px">Mặc định toàn bộ thông tin lấy từ phòng (giá, cọc tối thiểu, dịch vụ của phòng) — có thể chỉnh lại trước khi lưu.</p>';
  h += '<form class="form-card" onsubmit="event.preventDefault();saveContract()">' +
    fld('Phòng', selObj('c_room', db.rooms, room?room.id:'', function(x){ return x.name + ' — ' + houseName(x.houseId); }, undefined), true) +
    '<div class="form-sec"><h3 class="sec">Người đại diện (khách thuê)</h3><div class="fgrid">' +
    fld('Họ tên', inp('cu_name', ''), true) + fld('Ngày sinh', inp('cu_dob', '', 'date')) +
    fld('SDT', inp('cu_phone', ''), true) + fld('Giới tính', sel('cu_gender', ['Nam','Nữ','Khác'], 'Nam')) +
    fld('Email', inp('cu_email', '')) + fld('CMND/CCCD', inp('cu_idcard', '')) + '</div></div>' +
    '<div class="form-sec"><h3 class="sec">Thông tin hợp đồng</h3><div class="fgrid">' +
    fld('Ngày ký hợp đồng', inp('c_sign', today(), 'date')) +
    fld('Thời gian thuê từ', inp('c_start', today(), 'date'), true) +
    fld('đến', inp('c_end', addDays(today(), 365), 'date'), true) +
    fld('Giá phòng (vnđ)', inp('c_price', room?room.price:0, 'number'), true) +
    fld('Cọc (vnđ)', inp('c_deposit', room?room.minDeposit:0, 'number')) +
    fld('Số người ở', inp('c_people', room?room.maxPeople:1, 'number')) +
    fld('Số tháng thanh toán 1 lần', inp('c_payMonths', room?room.payMonths:1, 'number')) +
    fld('Thanh toán từ ngày', inp('c_from', room?room.payFromDay:1, 'number')) +
    fld('đến ngày', inp('c_to', room?room.payToDay:3, 'number')) + '</div></div>' +
    '<div class="form-sec"><h3 class="sec">Dịch vụ</h3><div class="fgrid">' +
    fld('Giá điện (vnđ)', inp('c_dien', svNum(rsv.dien, 3000), 'number')) +
    fld('Đơn vị điện', sel('c_dien_unit', [['so','số'],['nguoi','người']], 'so')) +
    fld('Giá nước (vnđ)', inp('c_nuoc', svNum(rsv.nuoc, 80000), 'number')) +
    fld('Đơn vị nước', sel('c_nuoc_unit', [['nguoi','người'],['so','số']], 'nguoi')) +
    fld('Điện chung (vnđ/người)', inp('c_dc', svNum(rsv.dienChung, 30000), 'number')) +
    fld('Vệ sinh (vnđ/người)', inp('c_vs', 20000, 'number')) +
    fld('Internet (vnđ/người)', inp('c_net', svNum(rsv.internet, 50000), 'number')) +
    fld('Xe máy — số lượng', inp('c_xm_n', 1, 'number')) + fld('Xe máy — phí/xe', inp('c_xm_f', 30000, 'number')) +
    fld('Ô tô — số lượng', inp('c_ot_n', 0, 'number')) + fld('Ô tô — phí/xe', inp('c_ot_f', 100000, 'number')) +
    fld('Xe đạp — số lượng', inp('c_xd_n', 0, 'number')) + fld('Xe đạp — phí/xe', inp('c_xd_f', 10000, 'number')) +
    '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">Đăng ký hợp đồng</button>' +
    '<button class="btn gray" type="button" onclick="go(\'contracts\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveContract(){
  var room = byId(db.rooms, val('c_room'));
  if(!room){ toast('Vui lòng chọn phòng'); return; }
  if(activeContract(room.id)){ toast('Phòng đã có hợp đồng đang hiệu lực'); return; }
  var custData = { name: val('cu_name'), dob: val('cu_dob') || null, phone: val('cu_phone'),
    gender: val('cu_gender'), email: val('cu_email'), idCard: val('cu_idcard') };
  createRec('customers', custData).then(function(cust){
    var services = { dien: { price: num(val('c_dien')), unit: val('c_dien_unit') },
      nuoc: { price: num(val('c_nuoc')), unit: val('c_nuoc_unit') },
      dienChung: { price: num(val('c_dc')) }, vesinh: { price: num(val('c_vs')) },
      internet: { price: num(val('c_net')) },
      xeMay: { count: num(val('c_xm_n')), fee: num(val('c_xm_f')) },
      oTo: { count: num(val('c_ot_n')), fee: num(val('c_ot_f')) },
      xeDap: { count: num(val('c_xd_n')), fee: num(val('c_xd_f')) } };
    return createRec('contracts', { houseId: room.houseId, roomId: room.id, customerId: cust.id,
      signDate: val('c_sign') || null, startDate: val('c_start') || null, endDate: val('c_end') || null,
      price: num(val('c_price')), deposit: num(val('c_deposit')), people: num(val('c_people')) || 1,
      payMonths: num(val('c_payMonths')) || 1, payFromDay: num(val('c_from')) || 1, payToDay: num(val('c_to')) || 3,
      services: services, status: 'active' });
  }).then(function(){ toast('Đã tạo hợp đồng — phòng đã chuyển sang Đã thuê'); go('contracts'); }).catch(errToast);
}
function viewContractDetail(p){
  var c = byId(db.contracts, p.id); if(!c){ toast('Không tìm thấy hợp đồng'); go('contracts'); return; }
  var cust = byId(db.customers, c.customerId), sv = c.services || {};
  function svLine(k){ var s = sv[k]; if(!s) return '—'; if(s.count !== undefined) return s.count + ' × ' + fmt(s.fee); return fmt(s.price) + (s.unit ? ' / ' + (s.unit==='so'?'số':'người') : ' / người'); }
  var h = pageTitle('Chi tiết hợp đồng ' + (c.code || ''));
  h += '<div class="card">' +
    '<div class="kv"><span>Nhà / Phòng</span><span>'+esc(houseName(c.houseId))+' / '+esc(roomName(c.roomId))+'</span></div>' +
    '<div class="kv"><span>Người đại diện</span><span>'+esc(cust?cust.name:'')+' — '+esc(cust?cust.phone:'')+'</span></div>' +
    '<div class="kv"><span>Ngày ký</span><span>'+fmtDate(c.signDate)+'</span></div>' +
    '<div class="kv"><span>Thời gian thuê</span><span>'+fmtDate(c.startDate)+' → '+fmtDate(c.endDate)+'</span></div>' +
    '<div class="kv"><span>Giá thuê / Cọc / Số người</span><span>'+fmt(c.price)+' / '+fmt(c.deposit)+' / '+c.people+'</span></div>' +
    '<div class="kv"><span>Điện / Nước</span><span>'+svLine('dien')+' / '+svLine('nuoc')+'</span></div>' +
    '<div class="kv"><span>Điện chung / Vệ sinh / Internet</span><span>'+svLine('dienChung')+' / '+svLine('vesinh')+' / '+svLine('internet')+'</span></div>' +
    '<div class="kv"><span>Xe máy / Ô tô / Xe đạp</span><span>'+svLine('xeMay')+' / '+svLine('oTo')+' / '+svLine('xeDap')+'</span></div>' +
    '<div class="kv"><span>Trạng thái</span><span>'+(c.status==='active'?'Đang hiệu lực':'Đã thanh lý')+'</span></div></div>';
  h += '<div class="btnrow">' + (c.status==='active' ? '<button class="btn orange" onclick="go(\'liquidate\',{id:\''+c.id+'\'})">Thanh lý hợp đồng</button>' : '') +
    '<button class="btn" onclick="quickMonthly(\''+c.roomId+'\')">Tạo hóa đơn tháng này</button>' +
    '<button class="btn gray" onclick="go(\'contracts\')">Quay lại</button></div>';
  setContent(h);
}
function viewLiquidate(p){
  var c = byId(db.contracts, p.id); if(!c){ go('contracts'); return; }
  var lastD = lastReading(c.roomId, 'dien'), lastN = lastReading(c.roomId, 'nuoc');
  var h = pageTitle('Thanh lý hợp đồng ' + (c.code || '') + ' — ' + roomName(c.roomId));
  h += '<form class="form-card" onsubmit="event.preventDefault();previewLiquidate(\''+c.id+'\')">' +
    '<h3 class="sec" style="margin-top:0">Bước 1 — Chốt công tơ & thông tin thanh lý</h3><div class="fgrid">' +
    fld('Ngày thanh lý', inp('lq_date', today(), 'date'), true) +
    fld('Điện — chỉ số cuối (trước: '+(lastD?lastD.current:0)+')', inp('lq_dien', lastD?lastD.current:'', 'number')) +
    fld('Nước — chỉ số cuối (trước: '+(lastN?lastN.current:0)+')', inp('lq_nuoc', lastN?lastN.current:'', 'number')) +
    fld('Tiền phòng đã trả thừa (vnđ)', inp('lq_prepaid', 0, 'number')) +
    '</div><label class="chk"><input type="checkbox" id="lq_refund"> Hoàn tiền phòng thừa cho khách</label>' +
    '<div class="btnrow"><button class="btn" type="submit">Tính thử (bước 2)</button>' +
    '<button class="btn gray" type="button" onclick="go(\'contracts\')">Quay lại</button></div></form><div id="lq_result"></div>';
  setContent(h);
}
function liqPayload(confirm){
  return { liquidateDate: val('lq_date'), dienFinal: val('lq_dien') === '' ? null : num(val('lq_dien')),
    nuocFinal: val('lq_nuoc') === '' ? null : num(val('lq_nuoc')),
    refundRoomFee: isChk('lq_refund'), prepaidRoomFee: num(val('lq_prepaid')), confirm: confirm };
}
function previewLiquidate(cid){
  api('/contracts/' + cid + '/liquidate', 'POST', liqPayload(false)).then(function(s){
    var h = '<div class="card" style="margin-top:14px"><h3 class="sec" style="margin-top:0">Bước 2 — Tổng hợp thanh lý</h3>' +
      '<div class="kv"><span>Số ngày ở kỳ cuối</span><span>'+s.days+' ngày</span></div>' +
      '<div class="kv"><span>Tiền phòng khách nợ</span><span>'+fmt(s.roomOwed)+'</span></div>' +
      s.lines.map(function(l){ return '<div class="kv"><span>'+esc(l.label)+'</span><span>'+fmt(l.amount)+'</span></div>'; }).join('') +
      '<div class="kv"><span>Tổng khách nợ</span><span>'+fmt(s.owedTotal)+'</span></div>' +
      '<div class="kv"><span>Trả khách (cọc + phòng thừa)</span><span>'+fmt(s.returnTotal)+'</span></div>' +
      '<div class="kv"><span>Kết quả</span><span>' + (s.net > 0 ? 'Khách đóng thêm ' + fmt(s.net) : (s.net < 0 ? 'Hoàn trả khách ' + fmt(-s.net) : 'Hòa — không thu thêm')) + '</span></div>' +
      '<div class="btnrow"><button class="btn green" onclick="confirmLiquidate(\''+cid+'\')">Hoàn tất thanh lý</button></div></div>';
    document.getElementById('lq_result').innerHTML = h;
  }).catch(errToast);
}
function confirmLiquidate(cid){
  api('/contracts/' + cid + '/liquidate', 'POST', liqPayload(true)).then(function(){
    return Promise.all([loadColl('contracts'), loadColl('invoices'), loadColl('expenses'), loadColl('meterReadings')]);
  }).then(function(){ toast('Đã thanh lý hợp đồng — phòng đã về Trống'); go('contracts'); }).catch(errToast);
}
/* ----- Hợp đồng chủ nhà + chủ nhà + thanh toán tiền nhà ----- */
function landlordContractsHtml(){
  var h = '<div class="btnrow"><button class="btn green" onclick="go(\'landlordContractForm\')">+ Thêm HĐ chủ nhà</button>' +
    '<button class="btn" onclick="go(\'landlordForm\')">+ Thêm chủ nhà</button></div>';
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Địa chỉ','Chủ nhà','Tiền thuê','Tiền cọc','Kỳ thanh toán','Thời gian thanh toán','Ngày bắt đầu','Ngày kết thúc','Trạng thái',''], db.landlordContracts.map(function(lc, i){
    var hs = byId(db.houses, lc.houseId);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(lc.code||'')+'</td><td>'+esc(hs?(hs.name||hs.address):'')+'</td><td>'+esc(hs?hs.address:'')+'</td>' +
      '<td>'+esc(landlordName(lc.landlordId))+'</td><td class="price">'+fmt(lc.rentPrice)+'</td><td>'+fmt(lc.deposit)+'</td>' +
      '<td>Hàng tháng</td><td>Ngày '+lc.payDay+'</td><td>'+fmtDate(lc.startDate)+'</td><td>'+fmtDate(lc.endDate)+'</td>' +
      '<td>'+(lc.status==='liquidated' ? '<span class="badge b-gray">Đã thanh lý</span>' : '<span class="badge b-paid">Đang hiệu lực</span>')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'landlordContractForm\',{id:\''+lc.id+'\'})">Sửa</button>' +
      (lc.status!=='liquidated' ? '<button class="linkbtn" onclick="liquidateLandlordContract(\''+lc.id+'\')">Thanh lý</button>' : '') +
      '<button class="linkbtn red" onclick="delBtn(\'HĐ chủ nhà '+esc(lc.code||'')+'\',\'landlordContracts\',\''+lc.id+'\',function(){viewContracts();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có hợp đồng chủ nhà');
  h += '<h3 class="sec">Chủ nhà</h3>' + tableHtml(['STT','Họ tên','SDT','Địa chỉ thường trú','Email','CMND',''], db.landlords.map(function(l, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(l.name)+'</b></td><td>'+esc(l.phone)+'</td><td>'+esc(l.permanentAddress || l.address)+'</td><td>'+esc(l.email||'')+'</td><td>'+esc(l.idCard||'')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'landlordForm\',{id:\''+l.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Chủ nhà '+esc(l.name)+'\',\'landlords\',\''+l.id+'\',function(){viewContracts();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có chủ nhà');
  h += '<h3 class="sec">Thanh toán tiền nhà</h3><form class="filters" onsubmit="event.preventDefault();saveHousePayment()">' +
    '<div class="fg"><label>Nhà thuê</label>'+selObj('hp_house', db.houses.filter(function(x){ return x.type==='rented'; }), '', function(x){ return (x.name||x.address); })+'</div>' +
    '<div class="fg"><label>Số tiền</label>'+inp('hp_amount', '', 'number')+'</div>' +
    '<div class="fg"><label>Ngày</label>'+inp('hp_date', today(), 'date')+'</div>' +
    '<button class="btn green">Ghi thanh toán</button></form>';
  h += tableHtml(['STT','Nhà','Chủ nhà','Số tiền','Ngày','Trạng thái'], db.housePayments.map(function(p2, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(p2.houseId))+'</td><td>'+esc(landlordName(p2.landlordId))+'</td><td class="price">'+fmt(p2.amount)+'</td><td>'+fmtDate(p2.date)+'</td><td>'+(p2.status==='paid'?'Đã thanh toán':'Chưa thanh toán')+'</td></tr>';
  }).join(''), 'Chưa có lần thanh toán nào');
  return h;
}
function liquidateLandlordContract(id){
  updateRec('landlordContracts', id, { status: 'liquidated' }).then(function(){ toast('Đã thanh lý hợp đồng chủ nhà'); viewContracts(); }).catch(errToast);
}
function saveHousePayment(){
  var house = byId(db.houses, val('hp_house')); if(!house){ toast('Chọn nhà thuê'); return; }
  var lc = landlordContractOf(house.id);
  createRec('housePayments', { houseId: house.id, landlordId: lc ? lc.landlordId : house.landlordId,
    amount: num(val('hp_amount')) || (lc ? lc.rentPrice : 0), date: val('hp_date') || today(), status: 'paid' })
    .then(function(){ toast('Đã ghi thanh toán tiền nhà'); viewContracts(); }).catch(errToast);
}
function viewLandlordContractForm(p){
  var lc = p.id ? byId(db.landlordContracts, p.id) : null;
  var h = pageTitle(lc ? 'Sửa hợp đồng chủ nhà' : 'Thêm hợp đồng chủ nhà');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveLandlordContract(\''+(lc?lc.id:'')+'\')"><div class="fgrid">' +
    fld('Chủ nhà', selObj('lc_landlord', db.landlords, lc?lc.landlordId:'', function(l){ return l.name + ' — ' + l.phone; }), true) +
    fld('Nhà', selObj('lc_house', db.houses, lc?lc.houseId:'', function(x){ return (x.name||x.address); }), true) +
    fld('Mã HĐ (để trống = tự sinh)', inp('lc_code', lc?lc.code:'')) +
    fld('Tiền thuê (vnđ)', inp('lc_rent', lc?lc.rentPrice:0, 'number')) +
    fld('Tiền cọc (vnđ)', inp('lc_deposit', lc?lc.deposit:0, 'number')) +
    fld('Ngày bắt đầu', inp('lc_start', lc?lc.startDate:'', 'date')) +
    fld('Ngày kết thúc', inp('lc_end', lc?lc.endDate:'', 'date')) +
    fld('Ngày thanh toán hàng tháng', inp('lc_payday', lc?lc.payDay:5, 'number')) +
    fld('Trạng thái', sel('lc_status', [['active','Đang hiệu lực'],['liquidated','Đã thanh lý']], lc?lc.status:'active')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="contractState.sub=\'landlord\';go(\'contracts\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveLandlordContract(id){
  var data = { landlordId: val('lc_landlord'), houseId: val('lc_house'), code: val('lc_code'),
    rentPrice: num(val('lc_rent')), deposit: num(val('lc_deposit')),
    startDate: val('lc_start') || null, endDate: val('lc_end') || null,
    payDay: num(val('lc_payday')) || 5, status: val('lc_status') };
  var pr = id ? updateRec('landlordContracts', id, data) : createRec('landlordContracts', data);
  pr.then(function(){ toast('Đã lưu hợp đồng chủ nhà'); contractState.sub='landlord'; go('contracts'); }).catch(errToast);
}
function viewLandlordForm(p){
  var l = p.id ? byId(db.landlords, p.id) : null;
  var h = pageTitle(l ? 'Sửa chủ nhà' : 'Thêm chủ nhà');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveLandlord(\''+(l?l.id:'')+'\')"><div class="fgrid">' +
    fld('Họ tên', inp('ll_name', l?l.name:''), true) + fld('Ngày sinh', inp('ll_dob', l?l.dob:'', 'date')) +
    fld('SDT', inp('ll_phone', l?l.phone:''), true) + fld('Giới tính', sel('ll_gender', ['Nam','Nữ','Khác'], l?l.gender:'Nam')) +
    fld('Nghề nghiệp', inp('ll_job', l?l.job:'')) + fld('Tình trạng hôn nhân', inp('ll_marital', l?l.maritalStatus:'')) +
    fld('Mail', inp('ll_email', l?l.email:'')) + fld('CMND/CCCD', inp('ll_idcard', l?l.idCard:'')) +
    fld('Địa chỉ thường trú', inp('ll_perm', l?l.permanentAddress:'')) + fld('Địa chỉ', inp('ll_addr', l?l.address:'')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="contractState.sub=\'landlord\';go(\'contracts\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveLandlord(id){
  var data = { name: val('ll_name'), phone: val('ll_phone'), address: val('ll_addr'),
    dob: val('ll_dob') || null, gender: val('ll_gender'), job: val('ll_job'),
    maritalStatus: val('ll_marital'), email: val('ll_email'), idCard: val('ll_idcard'),
    permanentAddress: val('ll_perm') };
  var pr = id ? updateRec('landlords', id, data) : createRec('landlords', data);
  pr.then(function(){ toast('Đã lưu chủ nhà'); contractState.sub='landlord'; go('contracts'); }).catch(errToast);
}
VIEWS.contracts = viewContracts; VIEWS.contractForm = viewContractForm;
VIEWS.contractDetail = viewContractDetail; VIEWS.liquidate = viewLiquidate;
VIEWS.landlordContractForm = viewLandlordContractForm; VIEWS.landlordForm = viewLandlordForm;

/* ================================================================
   6) HÓA ĐƠN
   ================================================================ */
var invFilter = { statuses: ['unpaid','partial','paid'] };
function viewInvoices(){
  var f = invFilter;
  var h = pageTitle('Danh sách hóa đơn');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('if_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng</label>'+selObj('if_room', db.rooms, f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Mã hóa đơn</label>'+inp('if_code', f.code||'', 'text', 'placeholder="Tìm mã..."')+'</div>' +
    '<div class="fg"><label>Loại hóa đơn</label>'+sel('if_kind', [['','Tất cả'],['monthly','Hóa đơn hàng tháng'],['other','Hóa đơn đặc biệt']], f.kind||'')+'</div>' +
    '<div class="fg"><label>Ngày tạo từ</label>'+inp('if_from', f.from||'', 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp('if_to', f.to||'', 'date')+'</div>' +
    '<div class="fg"><label>Trạng thái</label><span>' +
      chk('if_st_unpaid','Chưa thanh toán', f.statuses.indexOf('unpaid')>=0) +
      chk('if_st_partial','Thanh toán thiếu', f.statuses.indexOf('partial')>=0) +
      chk('if_st_paid','Thanh toán hết', f.statuses.indexOf('paid')>=0) + '</span></div>' +
    '<button class="btn" onclick="applyInvFilter()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'monthlyForm\')">Tạo hóa đơn hàng tháng</button>' +
    '<button class="btn" onclick="go(\'otherForm\')">Tạo hóa đơn đặc biệt</button>' +
    '<button class="btn gray" onclick="go(\'paymentsAll\')">Lịch sử thanh toán</button></div>';
  var list = db.invoices.filter(function(inv){
    if(f.houseId && inv.houseId !== f.houseId) return false;
    if(f.roomId && inv.roomId !== f.roomId) return false;
    if(f.code && (inv.code||'').toLowerCase().indexOf(f.code.toLowerCase())<0) return false;
    if(f.kind && inv.kind !== f.kind) return false;
    if(f.from && (inv.createdDate||'') < f.from) return false;
    if(f.to && (inv.createdDate||'') > f.to) return false;
    if(f.statuses.indexOf(invStatus(inv)) < 0) return false;
    return true;
  });
  h += tableHtml(['STT','Mã Hóa đơn','Tên nhà','Tên phòng','Mã Hợp đồng','Loại hóa đơn','Tổng tiền','Đã trả','Giảm giá','Còn lại','Ngày tạo','Trạng thái',''], list.map(function(inv, i){
    var ct = inv.roomId ? anyContract(inv.roomId) : null;
    var rem = (inv.total||0) - (inv.discount||0) - (inv.paidAmount||0);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(inv.code||'')+'</td><td>'+esc(houseName(inv.houseId))+'</td><td>'+esc(roomName(inv.roomId))+'</td>' +
      '<td>'+esc(ct ? (ct.code||'') : '')+'</td><td>'+(inv.kind==='monthly' ? 'Hóa đơn hàng tháng' : 'Hóa đơn đặc biệt')+'</td>' +
      '<td class="price">'+fmt(inv.total)+'</td><td>'+fmt(inv.paidAmount)+'</td><td>'+fmt(inv.discount)+'</td><td>'+fmt(rem)+'</td>' +
      '<td>'+fmtDate(inv.createdDate)+'</td><td>'+invBadge(inv)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'invoiceDetail\',{id:\''+inv.id+'\'})">Chi tiết</button>' +
      '<button class="linkbtn" onclick="showPayHistory(\''+inv.id+'\')">Lịch sử thanh toán</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Hóa đơn '+esc(inv.code||'')+'\',\'invoices\',\''+inv.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có hóa đơn nào');
  setContent(h);
}
function applyInvFilter(){
  var sts = []; if(isChk('if_st_unpaid')) sts.push('unpaid'); if(isChk('if_st_partial')) sts.push('partial'); if(isChk('if_st_paid')) sts.push('paid');
  invFilter = { houseId: val('if_house'), roomId: val('if_room'), code: val('if_code'), kind: val('if_kind'),
    from: val('if_from'), to: val('if_to'), statuses: sts.length ? sts : ['unpaid','partial','paid'] };
  viewInvoices();
}
function showPayHistory(invId){
  var inv = byId(db.invoices, invId);
  api('/invoices/' + invId + '/payments').then(function(pays){
    var h = '<h3>Lịch sử thanh toán — Hóa đơn '+esc(inv ? (inv.code||'') : '')+'</h3>';
    h += tableHtml(['Thời gian','Số tiền','Người nhận'], pays.map(function(p2){
      return '<tr><td>'+fmtDate(p2.date)+'</td><td class="price">'+fmt(p2.amount)+'</td><td>'+esc(p2.receiver)+'</td></tr>';
    }).join(''), 'Chưa có lần thanh toán nào');
    h += '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Đóng</button></div>';
    openModal(h);
  }).catch(errToast);
}
function viewInvoiceDetail(p){
  var inv = byId(db.invoices, p.id); if(!inv){ toast('Không tìm thấy hóa đơn'); go('invoices'); return; }
  var rem = (inv.total||0) - (inv.discount||0) - (inv.paidAmount||0);
  var h = '<div class="noprint">' + pageTitle('Chi tiết hóa đơn ' + (inv.code || '')) + '</div>';
  h += '<div class="card">' +
    '<div class="kv"><span>Nhà / Phòng</span><span>'+esc(houseName(inv.houseId))+' / '+esc(roomName(inv.roomId))+'</span></div>' +
    '<div class="kv"><span>Loại</span><span>'+(inv.kind==='monthly' ? 'Hóa đơn hàng tháng ' + (inv.month ? '(' + monthLabel(inv.month) + ')' : '') : 'Hóa đơn đặc biệt — ' + esc(inv.reason||''))+'</span></div>' +
    '<div class="kv"><span>Ngày tạo</span><span>'+fmtDate(inv.createdDate)+'</span></div>' +
    '<div class="kv"><span>Trạng thái</span><span>'+invBadge(inv)+'</span></div></div>';
  h += '<h3 class="sec">Tiền dịch vụ</h3>' + tableHtml(['STT','Khoản thu','Chỉ số đầu','Chỉ số cuối','Số lượng','Đơn vị','Đơn giá','Thành tiền'], (inv.lines||[]).map(function(l, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(l.label)+'</td><td>'+(l.prev==null?'':l.prev)+'</td><td>'+(l.current==null?'':l.current)+'</td><td>'+l.qty+'</td><td>'+esc(l.unit)+'</td><td>'+fmt(l.unitPrice)+'</td><td class="price">'+fmt(l.amount)+'</td></tr>';
  }).join(''), 'Không có dòng dịch vụ') ;
  h += '<div class="card" style="margin-top:12px">' +
    '<div class="kv"><span>Tiền phòng</span><span>'+fmt(inv.roomFee)+'</span></div>' +
    '<div class="kv"><span>Tổng hóa đơn</span><span>'+fmt(inv.total)+'</span></div>' +
    '<div class="kv"><span>Giảm giá</span><span>- '+fmt(inv.discount)+'</span></div>' +
    '<div class="kv"><span>Đã trả</span><span>'+fmt(inv.paidAmount)+'</span></div>' +
    '<div class="kv"><span>Còn lại</span><span>'+fmt(rem)+'</span></div></div>';
  if(rem > 0){
    h += '<div class="card noprint" style="margin-top:12px"><h3 class="sec" style="margin-top:0">Ghi thanh toán</h3><div class="fgrid">' +
      fld('Số tiền', inp('pay_amount', rem, 'number'), true) +
      fld('Ngày', inp('pay_date', today(), 'date')) +
      fld('Người nhận', inp('pay_receiver', currentUser ? currentUser.name : '')) +
      fld('Ghi chú', inp('pay_note', '')) + '</div>' +
      '<div class="btnrow"><button class="btn green" onclick="savePayment(\''+inv.id+'\')">Ghi thanh toán (tự tạo phiếu thu)</button></div></div>';
  }
  h += '<div class="btnrow noprint"><button class="btn" onclick="go(\'invoiceEdit\',{id:\''+inv.id+'\'})">Chỉnh sửa</button>' +
    '<button class="btn gray" onclick="go(\'invoicePrint\',{id:\''+inv.id+'\'})">Xem bản in / Gửi hóa đơn</button>' +
    '<button class="btn gray" onclick="go(\'invoices\')">Quay lại</button></div>';
  setContent(h);
}
function savePayment(invId){
  var amount = num(val('pay_amount'));
  if(!amount){ toast('Nhập số tiền thanh toán'); return; }
  api('/invoices/' + invId + '/payments', 'POST', { amount: amount, date: val('pay_date') || today(),
    receiver: val('pay_receiver'), note: val('pay_note') }).then(function(){
    return Promise.all([loadColl('invoices'), loadColl('receipts')]);
  }).then(function(){ toast('Đã ghi thanh toán + tạo phiếu thu'); go('invoiceDetail', { id: invId }); }).catch(errToast);
}
function viewInvoiceEdit(p){
  var inv = byId(db.invoices, p.id); if(!inv){ go('invoices'); return; }
  var h = pageTitle('Chỉnh sửa hóa đơn ' + (inv.code || ''));
  h += '<form class="form-card" onsubmit="event.preventDefault();saveInvoiceEdit(\''+inv.id+'\')"><div class="fgrid">' +
    fld('Tiền phòng (vnđ)', inp('ie_roomfee', inv.roomFee, 'number')) +
    fld('Giảm giá (vnđ)', inp('ie_discount', inv.discount, 'number')) +
    fld('Ngày tạo', inp('ie_date', inv.createdDate || '', 'date')) +
    fld('Lý do (hóa đơn đặc biệt)', inp('ie_reason', inv.reason || '')) + '</div>' +
    '<h3 class="sec">Dòng dịch vụ (Thành tiền = Đơn giá × Số lượng, tự tính khi lưu)</h3>' +
    '<div id="ie_lines">' + (inv.lines||[]).map(function(l, i){
      return '<div class="fgrid"><div>'+fld('Khoản thu', inp('ie_l_label_'+i, l.label))+'</div>' +
        '<div>'+fld('Đơn giá', inp('ie_l_price_'+i, l.unitPrice, 'number'))+'</div>' +
        '<div>'+fld('Số lượng', inp('ie_l_qty_'+i, l.qty, 'number'))+'</div>' +
        '<div>'+fld('Đơn vị', inp('ie_l_unit_'+i, l.unit))+'</div></div>';
    }).join('') + '</div>' +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu hóa đơn</button>' +
    '<button class="btn gray" type="button" onclick="go(\'invoiceDetail\',{id:\''+inv.id+'\'})">Quay lại</button></div></form>';
  setContent(h);
  window._ieLineCount = (inv.lines || []).length;
}
function saveInvoiceEdit(id){
  var lines = [];
  for(var i=0;i<(window._ieLineCount||0);i++){
    var price = num(val('ie_l_price_'+i)), qty = num(val('ie_l_qty_'+i));
    lines.push({ label: val('ie_l_label_'+i), unitPrice: price, qty: qty, unit: val('ie_l_unit_'+i), amount: price * qty });
  }
  updateRec('invoices', id, { roomFee: num(val('ie_roomfee')), discount: num(val('ie_discount')),
    createdDate: val('ie_date') || null, reason: val('ie_reason'), lines: lines })
    .then(function(){ return loadColl('invoices'); })
    .then(function(){ toast('Đã cập nhật hóa đơn'); go('invoiceDetail', { id: id }); }).catch(errToast);
}
function viewInvoicePrint(p){
  var inv = byId(db.invoices, p.id); if(!inv){ go('invoices'); return; }
  var rem = (inv.total||0) - (inv.discount||0) - (inv.paidAmount||0);
  var h = '<div class="btnrow noprint"><button class="btn" onclick="window.print()">In hóa đơn</button>' +
    '<button class="btn gray" onclick="go(\'invoiceDetail\',{id:\''+inv.id+'\'})">Quay lại</button></div>';
  h += '<div class="print-sheet"><h2 style="text-align:center;color:#1565c0">HÓA ĐƠN '+(inv.kind==='monthly' ? monthLabel(inv.month||'').toUpperCase() : 'ĐẶC BIỆT')+'</h2>' +
    '<p style="text-align:center;color:#757575">Mã hóa đơn: '+esc(inv.code||'')+' — Ngày tạo: '+fmtDate(inv.createdDate)+'</p>' +
    '<div class="kv"><span>Nhà</span><span>'+esc(houseName(inv.houseId))+' — '+esc(houseAddr(inv.houseId))+'</span></div>' +
    '<div class="kv"><span>Phòng</span><span>'+esc(roomName(inv.roomId))+'</span></div>' +
    (inv.reason ? '<div class="kv"><span>Lý do thu</span><span>'+esc(inv.reason)+'</span></div>' : '') +
    '<h3 class="sec">Chi tiết khoản thu</h3>' +
    tableHtml(['STT','Khoản thu','Chỉ số đầu','Chỉ số cuối','Số lượng','Đơn vị','Đơn giá','Thành tiền'], (inv.lines||[]).map(function(l, i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(l.label)+'</td><td>'+(l.prev==null?'':l.prev)+'</td><td>'+(l.current==null?'':l.current)+'</td><td>'+l.qty+'</td><td>'+esc(l.unit)+'</td><td>'+fmt(l.unitPrice)+'</td><td>'+fmt(l.amount)+'</td></tr>';
    }).join(''), 'Không có dòng dịch vụ') +
    '<div class="kv"><span>Tiền phòng</span><span>'+fmt(inv.roomFee)+'</span></div>' +
    '<div class="kv"><span>Tổng cộng</span><span>'+fmt(inv.total)+'</span></div>' +
    '<div class="kv"><span>Giảm giá</span><span>- '+fmt(inv.discount)+'</span></div>' +
    '<div class="kv"><span>Đã thanh toán</span><span>'+fmt(inv.paidAmount)+'</span></div>' +
    '<div class="kv"><span>Còn phải thanh toán</span><span>'+fmt(rem)+'</span></div></div>';
  setContent(h);
}
function viewPaymentsAll(){
  api('/invoice-payments').then(function(pays){
    var h = pageTitle('Lịch sử thanh toán hóa đơn');
    h += tableHtml(['STT','Mã hóa đơn','Tên nhà','Tên phòng','Thời gian thanh toán','Số tiền','Người nhận'], pays.map(function(p2, i){
      var inv = byId(db.invoices, p2.invoiceId);
      return '<tr><td>'+(i+1)+'</td><td>'+esc(inv ? (inv.code||'') : '')+'</td><td>'+esc(inv ? houseName(inv.houseId) : '')+'</td><td>'+esc(inv ? roomName(inv.roomId) : '')+'</td>' +
        '<td>'+fmtDate(p2.date)+'</td><td class="price">'+fmt(p2.amount)+'</td><td>'+esc(p2.receiver)+'</td></tr>';
    }).join(''), 'Chưa có lần thanh toán nào');
    setContent(h);
  }).catch(errToast);
}
function viewMonthlyForm(){
  var rented = db.rooms.filter(function(r){ return !!activeContract(r.id); });
  var h = pageTitle('Tạo hóa đơn hàng tháng');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveMonthly()"><div class="fgrid">' +
    fld('Phòng có hợp đồng', selObj('mf_room', rented, '', function(x){ return x.name + ' — ' + houseName(x.houseId); }), true) +
    fld('Tháng', inp('mf_month', curMonth(), 'month'), true) +
    fld('Điện — chỉ số đầu (để trống = tự lấy)', inp('mf_dp', '', 'number')) +
    fld('Điện — chỉ số cuối', inp('mf_dc', '', 'number')) +
    fld('Nước — chỉ số đầu', inp('mf_np', '', 'number')) +
    fld('Nước — chỉ số cuối', inp('mf_nc', '', 'number')) +
    fld('Số người (ghi đè nếu khác HĐ)', inp('mf_ppl', '', 'number')) +
    '</div><p style="color:#616161;margin-top:8px">Tiền phòng + các dòng dịch vụ tự tính từ hợp đồng và chỉ số chốt gần nhất.</p>' +
    '<div class="btnrow"><button class="btn green" type="submit">Tạo hóa đơn</button>' +
    '<button class="btn gray" type="button" onclick="go(\'invoices\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveMonthly(){
  var body = { roomId: val('mf_room'), month: val('mf_month') };
  if(val('mf_dp') !== '') body.dienPrev = num(val('mf_dp'));
  if(val('mf_dc') !== '') body.dienCurr = num(val('mf_dc'));
  if(val('mf_np') !== '') body.nuocPrev = num(val('mf_np'));
  if(val('mf_nc') !== '') body.nuocCurr = num(val('mf_nc'));
  if(val('mf_ppl') !== '') body.people = num(val('mf_ppl'));
  api('/invoices/monthly', 'POST', body).then(function(inv){
    return loadColl('invoices').then(function(){ toast('Đã tạo hóa đơn tháng'); go('invoiceDetail', { id: inv.id }); });
  }).catch(errToast);
}
function viewOtherForm(){
  var h = pageTitle('Tạo hóa đơn đặc biệt');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveOther()"><div class="fgrid">' +
    fld('Lý do thu', inp('of_reason', ''), true) +
    fld('Số tiền thu (vnđ)', inp('of_amount', 0, 'number'), true) +
    fld('Đơn vị', sel('of_unit', [['phong','theo phòng'],['nguoi','theo người']], 'phong')) +
    fld('Ghi chú', inp('of_note', '')) + '</div>' +
    '<h3 class="sec">Chọn phòng nhận hóa đơn</h3><div>' +
    '<label class="chk"><input type="checkbox" id="of_all" onchange="document.querySelectorAll(\'.of_room\').forEach(function(x){ x.checked = this.checked; }.bind(this))"> Tất cả / Bỏ tất cả</label><br>' +
    db.rooms.map(function(r){
      return '<label class="chk"><input type="checkbox" class="of_room" value="'+r.id+'"> '+esc(r.name)+' — '+esc(houseName(r.houseId))+'</label>';
    }).join('') + '</div>' +
    '<div class="btnrow"><button class="btn green" type="submit">Tạo hóa đơn đặc biệt</button>' +
    '<button class="btn gray" type="button" onclick="go(\'invoices\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveOther(){
  var amount = num(val('of_amount')), unit = val('of_unit'), reason = val('of_reason');
  var roomIds = Array.prototype.map.call(document.querySelectorAll('.of_room:checked'), function(x){ return x.value; });
  if(!roomIds.length){ toast('Hãy chọn ít nhất 1 phòng'); return; }
  var jobs = roomIds.map(function(rid){
    var room = byId(db.rooms, rid), ct = activeContract(rid);
    var qty = unit === 'nguoi' ? (ct ? (ct.people || 1) : 1) : 1;
    return api('/invoices', 'POST', { kind: 'other', houseId: room.houseId, roomId: rid, reason: reason,
      createdDate: today(), lines: [{ label: reason, unitPrice: amount, unit: unit === 'nguoi' ? 'người' : 'phòng', qty: qty, amount: amount * qty }] });
  });
  Promise.all(jobs).then(function(){ return loadColl('invoices'); })
    .then(function(){ toast('Đã tạo ' + jobs.length + ' hóa đơn đặc biệt'); go('invoices'); }).catch(errToast);
}
VIEWS.invoices = viewInvoices; VIEWS.invoiceDetail = viewInvoiceDetail; VIEWS.invoiceEdit = viewInvoiceEdit;
VIEWS.invoicePrint = viewInvoicePrint; VIEWS.paymentsAll = viewPaymentsAll;
VIEWS.monthlyForm = viewMonthlyForm; VIEWS.otherForm = viewOtherForm;

/* ================================================================
   7) TÀI CHÍNH — Thu | Chi | Thống kê
   ================================================================ */
var finState = { tab:'thu' };
function viewFinance(){
  var st = finState;
  var h = pageTitle('Tài chính');
  h += '<div class="tabs"><span class="tab'+(st.tab==='thu'?' on':'')+'" onclick="finState.tab=\'thu\';viewFinance()">Thu</span>' +
    '<span class="tab'+(st.tab==='chi'?' on':'')+'" onclick="finState.tab=\'chi\';viewFinance()">Chi</span>' +
    '<span class="tab'+(st.tab==='tk'?' on':'')+'" onclick="finState.tab=\'tk\';viewFinance()">Thống kê</span></div>';
  if(st.tab === 'thu') setContent(h + financeThuHtml());
  else if(st.tab === 'chi') setContent(h + financeChiHtml());
  else financeStats(h);
}
var finThuF = {}, finChiF = {};
function finFilterHtml(prefix, f, personLabels){
  return '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj(prefix+'_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng</label>'+selObj(prefix+'_room', db.rooms, f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>'+personLabels[0]+'</label>'+inp(prefix+'_p1', f.p1||'')+'</div>' +
    '<div class="fg"><label>'+personLabels[1]+'</label>'+inp(prefix+'_p2', f.p2||'')+'</div>' +
    '<div class="fg"><label>Ngày tạo từ</label>'+inp(prefix+'_cf', f.cf||'', 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp(prefix+'_ct', f.ct||'', 'date')+'</div>' +
    '<div class="fg"><label>'+personLabels[2]+' từ</label>'+inp(prefix+'_pf', f.pf||'', 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp(prefix+'_pt', f.pt||'', 'date')+'</div>' +
    '<button class="btn" onclick="applyFinFilter(\''+prefix+'\')">Lọc</button></div>';
}
function applyFinFilter(prefix){
  var t = { houseId: val(prefix+'_house'), roomId: val(prefix+'_room'), p1: val(prefix+'_p1'), p2: val(prefix+'_p2'),
    cf: val(prefix+'_cf'), ct: val(prefix+'_ct'), pf: val(prefix+'_pf'), pt: val(prefix+'_pt') };
  if(prefix === 'ft') finThuF = t; else finChiF = t;
  viewFinance();
}
function finMatch(f, houseId, roomId, pers1, pers2, created, paid){
  if(f.houseId && houseId !== f.houseId) return false;
  if(f.roomId && roomId !== f.roomId) return false;
  if(f.p1 && (pers1||'').toLowerCase().indexOf(f.p1.toLowerCase())<0) return false;
  if(f.p2 && (pers2||'').toLowerCase().indexOf(f.p2.toLowerCase())<0) return false;
  if(f.cf && (created||'') < f.cf) return false;
  if(f.ct && (created||'') > f.ct) return false;
  if(f.pf && (paid||'') < f.pf) return false;
  if(f.pt && (paid||'') > f.pt) return false;
  return true;
}
function financeThuHtml(){
  var f = finThuF;
  var h = finFilterHtml('ft', f, ['Người thu','Người nộp','Ngày thu']);
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'receiptForm\')">+ Thêm khoản thu</button></div>';
  var list = db.receipts.filter(function(r){ return finMatch(f, r.houseId, r.roomId, r.collector, r.payer, r.createdDate, r.collectDate); });
  var total = list.reduce(function(s, r){ return s + (r.amount||0); }, 0);
  h += tableHtml(['STT','Mã phiếu thu','Tên nhà','Tên phòng','Mã Hợp đồng','Khoản thu','Ngày tạo','Ngày thu','Người thu','Người nộp','Số tiền thu',''], list.map(function(r, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(r.code||'')+'</td><td>'+esc(houseName(r.houseId))+'</td><td>'+esc(roomName(r.roomId))+'</td>' +
      '<td>'+esc(r.contractCode||'')+'</td><td>'+esc(r.title)+'</td><td>'+fmtDate(r.createdDate)+'</td><td>'+fmtDate(r.collectDate)+'</td>' +
      '<td>'+esc(r.collector)+'</td><td>'+esc(r.payer)+'</td><td class="price">'+fmt(r.amount)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'receiptForm\',{id:\''+r.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Phiếu thu '+esc(r.code||'')+'\',\'receipts\',\''+r.id+'\',function(){viewFinance();})">Xóa</button></td></tr>';
  }).join('') + '<tr class="total"><td colspan="10">Tổng thu</td><td>'+fmt(total)+'</td><td></td></tr>');
  return h;
}
function financeChiHtml(){
  var f = finChiF;
  var h = finFilterHtml('fc', f, ['Người chi','Người nhận','Ngày chi']);
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'expenseForm\')">+ Thêm khoản chi</button></div>';
  var list = db.expenses.filter(function(e){ return finMatch(f, e.houseId, e.roomId, e.spender, e.receiverName, e.date, e.payDate || e.date); });
  var total = list.reduce(function(s, e){ return s + (e.amount||0); }, 0);
  h += tableHtml(['STT','Mã phiếu chi','Tên nhà','Tên phòng','Mã Hợp đồng','Khoản chi','Ngày tạo','Ngày chi','Người chi','Người nhận','SDT người nhận','Số tiền chi',''], list.map(function(e, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(e.code||'')+'</td><td>'+esc(houseName(e.houseId))+'</td><td>'+esc(roomName(e.roomId))+'</td>' +
      '<td>'+esc(e.contractCode||'')+'</td><td>'+esc(e.title)+'</td><td>'+fmtDate(e.date)+'</td><td>'+fmtDate(e.payDate || e.date)+'</td>' +
      '<td>'+esc(e.spender||'')+'</td><td>'+esc(e.receiverName||'')+'</td><td>'+esc(e.receiverPhone||'')+'</td><td class="price">'+fmt(e.amount)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'expenseForm\',{id:\''+e.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Phiếu chi '+esc(e.code||e.title)+'\',\'expenses\',\''+e.id+'\',function(){viewFinance();})">Xóa</button></td></tr>';
  }).join('') + '<tr class="total"><td colspan="11">Tổng chi</td><td>'+fmt(total)+'</td><td></td></tr>');
  return h;
}
function barChart(title, rows, key, color){
  var max = Math.max.apply(null, rows.map(function(r){ return Math.abs(r[key]); }).concat([1]));
  var h = '<h3 class="sec">'+esc(title)+'</h3><div class="chart">' + rows.map(function(r){
    var pct = Math.max(2, Math.round(Math.abs(r[key]) / max * 100));
    return '<div class="col"><div class="cv">'+fmt(r[key])+'</div><div class="bar" style="height:'+pct+'%;background:'+color+'"></div><div class="cl">'+esc(r.month.slice(5))+'/'+esc(r.month.slice(0,4))+'</div></div>';
  }).join('') + '</div>';
  return h;
}
function financeStats(prefixHtml){
  api('/analytics/summary').then(function(a){
    var rows = a.months || [];
    var h = prefixHtml + barChart('Biểu đồ thu (theo phiếu thu)', rows, 'income', '#43a047');
    h += barChart('Biểu đồ chi', rows, 'expense', '#e53935');
    h += barChart('Biểu đồ lợi nhuận', rows, 'profit', '#1565c0');
    h += '<h3 class="sec">Phân tích dòng vốn</h3>' + tableHtml(['Tháng','Thu','Chi','Lợi nhuận','Lũy kế'], rows.map(function(r){
      return '<tr><td>'+esc(monthLabel(r.month))+'</td><td>'+fmt(r.income)+'</td><td>'+fmt(r.expense)+'</td><td>'+fmt(r.profit)+'</td><td class="price">'+fmt(r.cumulative)+'</td></tr>';
    }).join(''));
    setContent(h);
  }).catch(errToast);
}
function viewReceiptForm(p){
  var r = p.id ? byId(db.receipts, p.id) : null;
  var h = pageTitle(r ? 'Sửa khoản thu' : 'Thêm khoản thu');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveReceipt(\''+(r?r.id:'')+'\')"><div class="fgrid">' +
    fld('Khoản thu', inp('rc_title', r?r.title:''), true) +
    fld('Số tiền thu (vnđ)', inp('rc_amount', r?r.amount:0, 'number'), true) +
    fld('Nhà', selObj('rc_house', db.houses, r?r.houseId:'', function(x){ return (x.name||x.address); }, '-- Không chọn --')) +
    fld('Phòng', selObj('rc_room', db.rooms, r?r.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Không chọn --')) +
    fld('Mã hợp đồng', inp('rc_contract', r?r.contractCode:'')) +
    fld('Ngày tạo', inp('rc_created', r?r.createdDate:today(), 'date')) +
    fld('Ngày thu', inp('rc_collect', r?r.collectDate:today(), 'date')) +
    fld('Người thu', inp('rc_collector', r?r.collector:(currentUser?currentUser.name:''))) +
    fld('Đối tượng nộp', sel('rc_payerType', [['tenant','Khách thuê'],['other','Người khác']], 'tenant')) +
    fld('Khách thuê (nếu chọn khách thuê)', selObj('rc_cust', db.customers, '', function(c){ return c.name + ' — ' + c.phone; }, '-- Chọn khách --')) +
    fld('Tên người khác', inp('rc_payerName', r?r.payer:'')) +
    fld('SDT người khác', inp('rc_payerPhone', '')) +
    '</div>' + fld('Ghi chú', '<textarea id="rc_note">'+esc(r?r.note:'')+'</textarea>') +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu khoản thu</button>' +
    '<button class="btn gray" type="button" onclick="finState.tab=\'thu\';go(\'finance\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveReceipt(id){
  var payer = val('rc_payerType') === 'tenant'
    ? (function(){ var c = byId(db.customers, val('rc_cust')); return c ? c.name : val('rc_payerName'); })()
    : (val('rc_payerName') + (val('rc_payerPhone') ? ' (' + val('rc_payerPhone') + ')' : ''));
  var room = byId(db.rooms, val('rc_room'));
  var data = { title: val('rc_title'), amount: num(val('rc_amount')),
    houseId: room ? room.houseId : (val('rc_house') || null), roomId: val('rc_room') || null,
    contractCode: val('rc_contract'), createdDate: val('rc_created') || null,
    collectDate: val('rc_collect') || null, collector: val('rc_collector'), payer: payer, note: val('rc_note') };
  var pr = id ? updateRec('receipts', id, data) : createRec('receipts', data);
  pr.then(function(){ toast('Đã lưu khoản thu'); finState.tab='thu'; go('finance'); }).catch(errToast);
}
function viewExpenseForm(p){
  var e = p.id ? byId(db.expenses, p.id) : null;
  var h = pageTitle(e ? 'Sửa khoản chi' : 'Thêm khoản chi');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveExpense(\''+(e?e.id:'')+'\')"><div class="fgrid">' +
    fld('Khoản chi', inp('ex_title', e?e.title:''), true) +
    fld('Số tiền chi (vnđ)', inp('ex_amount', e?e.amount:0, 'number'), true) +
    fld('Nhà', selObj('ex_house', db.houses, e?e.houseId:'', function(x){ return (x.name||x.address); }, '-- Không chọn --')) +
    fld('Phòng', selObj('ex_room', db.rooms, e?e.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Không chọn --')) +
    fld('Mã hợp đồng', inp('ex_contract', e?e.contractCode:'')) +
    fld('Ngày tạo', inp('ex_date', e?e.date:today(), 'date')) +
    fld('Ngày chi', inp('ex_paydate', e?e.payDate:today(), 'date')) +
    fld('Người chi', inp('ex_spender', e?e.spender:(currentUser?currentUser.name:''))) +
    fld('Người nhận', inp('ex_receiver', e?e.receiverName:'')) +
    fld('SDT người nhận', inp('ex_phone', e?e.receiverPhone:'')) +
    '</div>' + fld('Ghi chú', '<textarea id="ex_note">'+esc(e?e.note:'')+'</textarea>') +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu khoản chi</button>' +
    '<button class="btn gray" type="button" onclick="finState.tab=\'chi\';go(\'finance\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveExpense(id){
  var room = byId(db.rooms, val('ex_room'));
  var data = { title: val('ex_title'), amount: num(val('ex_amount')),
    houseId: room ? room.houseId : (val('ex_house') || null), roomId: val('ex_room') || null,
    contractCode: val('ex_contract'), date: val('ex_date') || null, payDate: val('ex_paydate') || null,
    spender: val('ex_spender'), receiverName: val('ex_receiver'), receiverPhone: val('ex_phone'), note: val('ex_note') };
  var pr = id ? updateRec('expenses', id, data) : createRec('expenses', data);
  pr.then(function(){ toast('Đã lưu khoản chi'); finState.tab='chi'; go('finance'); }).catch(errToast);
}
VIEWS.finance = viewFinance; VIEWS.receiptForm = viewReceiptForm; VIEWS.expenseForm = viewExpenseForm;

/* ================================================================
   8) DỊCH VỤ
   ================================================================ */
function viewServices(){
  var h = pageTitle('Danh sách dịch vụ');
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'serviceForm\')">+ Thêm Dịch Vụ</button></div>';
  h += tableHtml(['STT','Tên Dịch Vụ','Giá Dịch Vụ','Đơn vị',''], db.services.map(function(s, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(s.name)+'</b></td><td class="price">'+fmt(s.price)+'</td><td>'+esc(unitName(s.unitId))+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'serviceForm\',{id:\''+s.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Dịch vụ '+esc(s.name)+'\',\'services\',\''+s.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có dịch vụ nào');
  setContent(h);
}
function viewServiceForm(p){
  var s = p.id ? byId(db.services, p.id) : null;
  var h = pageTitle(s ? 'Sửa dịch vụ' : 'Thêm dịch vụ');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveService(\''+(s?s.id:'')+'\')"><div class="fgrid">' +
    fld('Tên dịch vụ', inp('sv_name', s?s.name:''), true) +
    fld('Giá dịch vụ (vnđ)', inp('sv_price', s?s.price:0, 'number')) +
    fld('Đơn vị', selObj('sv_unit', db.units, s?s.unitId:'', function(u){ return u.name; }, '-- Chọn đơn vị --')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'services\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveService(id){
  var data = { name: val('sv_name'), price: num(val('sv_price')), unitId: val('sv_unit') || null };
  var pr = id ? updateRec('services', id, data) : createRec('services', data);
  pr.then(function(){ toast('Đã lưu dịch vụ'); go('services'); }).catch(errToast);
}
VIEWS.services = viewServices; VIEWS.serviceForm = viewServiceForm;

/* ================================================================
   9) NHÂN VIÊN — DS | Phân chức vụ theo nhà | Chức vụ | Vai trò
   ================================================================ */
var staffState = { tab:'list' };
var PERM_MODULES = [['nha','Quản lý nhà'],['phong','Quản lý phòng'],['dichVu','Cấu hình dịch vụ'],['hopDong','Quản lý hợp đồng phòng'],['khachThue','Quản lý khách thuê'],['thuChi','Quản lý thu chi'],['thongBao','Quản lý thông báo']];
function assignmentsOf(accountId){ return db.staffAssignments.filter(function(a){ return a.accountId === accountId; }); }
function viewStaff(){
  var st = staffState;
  var h = pageTitle('Nhân viên');
  var tabs = [['list','Danh sách nhân viên'],['assign','Phân chức vụ theo nhà'],['positions','Chức vụ'],['roles','Phân chia vai trò theo chức vụ']];
  h += '<div class="tabs">' + tabs.map(function(t){
    return '<span class="tab'+(st.tab===t[0]?' on':'')+'" onclick="staffState.tab=\''+t[0]+'\';viewStaff()">'+t[1]+'</span>'; }).join('') + '</div>';
  if(st.tab === 'list') h += staffListHtml();
  else if(st.tab === 'assign') h += staffAssignHtml();
  else if(st.tab === 'positions') h += staffPositionsHtml();
  else h += staffRolesHtml();
  setContent(h);
}
var staffF = {};
function staffListHtml(){
  var f = staffF;
  var h = '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('sf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Nhân viên</label>'+inp('sf_q', f.q||'', 'text', 'placeholder="Tên / SDT"')+'</div>' +
    '<div class="fg"><label>Chức vụ</label>'+selObj('sf_pos', db.positions, f.posId||'', function(x){ return x.name; }, 'Tất cả')+'</div>' +
    '<button class="btn" onclick="staffF={houseId:val(\'sf_house\'),q:val(\'sf_q\'),posId:val(\'sf_pos\')};viewStaff()">Lọc</button>' +
    '<button class="btn green" onclick="go(\'staffForm\')">+ Thêm nhân viên</button></div>';
  var list = db.accounts.filter(function(a){
    var as = assignmentsOf(a.id);
    if(f.houseId && !as.some(function(x){ return x.houseId === f.houseId; })) return false;
    if(f.posId && !as.some(function(x){ return x.positionId === f.posId; })) return false;
    if(f.q && (a.name + ' ' + (a.phone||'')).toLowerCase().indexOf(f.q.toLowerCase())<0) return false;
    return true;
  });
  h += tableHtml(['STT','Nhân Viên','Chức vụ','Nhà','Vai trò đăng nhập',''], list.map(function(a, i){
    var as = assignmentsOf(a.id);
    var posNames = as.map(function(x){ return positionName(x.positionId); }).filter(Boolean).join(', ');
    var houseNames = as.map(function(x){ return houseName(x.houseId); }).filter(Boolean).join(', ');
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(a.name)+'</b><br><span style="color:#757575">'+esc(a.phone||'')+'</span></td>' +
      '<td>'+esc(posNames || '—')+'</td><td>'+esc(houseNames || '—')+'</td><td>'+esc(roleLabel(a.role))+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'staffForm\',{id:\''+a.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Nhân viên '+esc(a.name)+'\',\'accounts\',\''+a.id+'\',function(){viewStaff();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có nhân viên nào');
  return h;
}
function staffAssignHtml(){
  var h = '<form class="filters" onsubmit="event.preventDefault();saveAssignment()">' +
    '<div class="fg"><label>Nhà</label>'+selObj('sa_house', db.houses, '', function(x){ return (x.name||x.address); })+'</div>' +
    '<div class="fg"><label>Nhân viên</label>'+selObj('sa_acc', db.accounts, '', function(x){ return x.name + ' (' + (x.phone||'') + ')'; })+'</div>' +
    '<div class="fg"><label>Chức vụ</label>'+selObj('sa_pos', db.positions, '', function(x){ return x.name; })+'</div>' +
    '<button class="btn green">+ Gán chức vụ</button></form>';
  h += tableHtml(['STT','Nhà','Nhân Viên','Chức vụ',''], db.staffAssignments.map(function(a, i){
    var acc = byId(db.accounts, a.accountId);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(a.houseId))+'</td><td>'+esc(acc ? (acc.name + ' (' + (acc.phone||'') + ')') : '')+'</td><td>'+esc(positionName(a.positionId))+'</td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Phân công này\',\'staffAssignments\',\''+a.id+'\',function(){viewStaff();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có phân công nào');
  return h;
}
function saveAssignment(){
  createRec('staffAssignments', { accountId: val('sa_acc'), houseId: val('sa_house'), positionId: val('sa_pos') })
    .then(function(){ toast('Đã gán chức vụ'); viewStaff(); }).catch(errToast);
}
function staffPositionsHtml(){
  var h = '<form class="filters" onsubmit="event.preventDefault();savePosition()">' +
    '<div class="fg"><label>Tên chức vụ mới</label>'+inp('pos_name', '', 'text', 'placeholder="VD: Lễ tân"')+'</div>' +
    '<button class="btn green">+ Thêm chức vụ</button></form>';
  h += tableHtml(['STT','Chức vụ',''], db.positions.map(function(p2, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(p2.name)+'</b></td>' +
      '<td class="act"><button class="linkbtn" onclick="renamePosition(\''+p2.id+'\',\''+esc(p2.name)+'\')">Sửa tên</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Chức vụ '+esc(p2.name)+'\',\'positions\',\''+p2.id+'\',function(){viewStaff();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có chức vụ nào');
  return h;
}
function savePosition(){
  if(!val('pos_name')){ toast('Nhập tên chức vụ'); return; }
  createRec('positions', { name: val('pos_name'), permissions: { thongKe: false } })
    .then(function(){ toast('Đã thêm chức vụ'); viewStaff(); }).catch(errToast);
}
function renamePosition(id, oldName){
  openModal('<h3>Sửa tên chức vụ</h3><label class="fl">Tên chức vụ</label><input id="pos_newname" value="'+esc(oldName)+'">' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Hủy</button><button class="btn" id="pos_save">Lưu</button></div>');
  document.getElementById('pos_save').onclick = function(){
    updateRec('positions', id, { name: val('pos_newname') }).then(function(){ closeModal(); toast('Đã đổi tên'); viewStaff(); }).catch(errToast);
  };
}
function staffRolesHtml(){
  var pos = db.positions[0];
  var h = '<div class="filters"><div class="fg"><label>Chọn chức vụ</label>' +
    selObj('role_pos', db.positions, pos ? pos.id : '', function(x){ return x.name; }) + '</div>' +
    '<button class="btn" onclick="renderRoleMatrix()">Xem ma trận quyền</button></div><div id="role_matrix"></div>';
  setTimeout(renderRoleMatrix, 0);
  return h;
}
function renderRoleMatrix(){
  var el = document.getElementById('role_matrix'); if(!el) return;
  var pos = byId(db.positions, val('role_pos')); if(!pos){ el.innerHTML = '<div class="empty-note">Chưa có chức vụ</div>'; return; }
  var perms = pos.permissions || {};
  var rows = '<tr><td>Xem thống kê/Báo cáo</td><td colspan="3">'+chk('rp_thongKe','Được xem', !!perms.thongKe)+'</td></tr>';
  PERM_MODULES.forEach(function(m){
    var mp = perms[m[0]] || {};
    rows += '<tr><td>'+m[1]+'</td><td>'+chk('rp_'+m[0]+'_add','Thêm', !!mp.add)+'</td><td>'+chk('rp_'+m[0]+'_edit','Sửa', !!mp.edit)+'</td><td>'+chk('rp_'+m[0]+'_delete','Xóa', !!mp.delete)+'</td></tr>';
  });
  el.innerHTML = '<div class="tblwrap"><table><thead><tr><th>Module</th><th>Thêm</th><th>Sửa</th><th>Xóa</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="btnrow"><button class="btn green" onclick="saveRoleMatrix(\''+pos.id+'\')">Lưu vai trò cho chức vụ '+esc(pos.name)+'</button></div>' +
    '<p style="color:#757575">Lưu ý: phân quyền đăng nhập (admin/staff) giữ nguyên như hiện tại; đây là lớp vai trò nghiệp vụ theo thiết kế.</p>';
}
function saveRoleMatrix(posId){
  var perms = { thongKe: isChk('rp_thongKe') };
  PERM_MODULES.forEach(function(m){
    perms[m[0]] = { add: isChk('rp_'+m[0]+'_add'), edit: isChk('rp_'+m[0]+'_edit'), delete: isChk('rp_'+m[0]+'_delete') };
  });
  updateRec('positions', posId, { permissions: perms }).then(function(){ toast('Đã lưu vai trò'); viewStaff(); }).catch(errToast);
}
function viewStaffForm(p){
  var a = p.id ? byId(db.accounts, p.id) : null;
  var h = pageTitle(a ? 'Sửa nhân viên' : 'Thêm nhân viên');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveStaff(\''+(a?a.id:'')+'\')"><div class="fgrid">' +
    fld('Họ tên', inp('st_name', a?a.name:''), true) +
    fld('Ngày sinh', inp('st_dob', a?a.dob:'', 'date')) +
    fld('SDT (dùng đăng nhập)', inp('st_phone', a?a.phone:''), true) +
    (a ? '' : fld('Mật khẩu đăng nhập', inp('st_pw', '', 'password'))) +
    fld('Vai trò đăng nhập', sel('st_role', [['staff','Nhân viên'],['admin','Quản trị viên']], a?a.role:'staff')) +
    fld('Giới tính', sel('st_gender', ['Nam','Nữ','Khác'], a?a.gender:'Nam')) +
    fld('Nghề nghiệp', inp('st_job', a?a.job:'')) +
    fld('Tình trạng hôn nhân', inp('st_marital', a?a.maritalStatus:'')) +
    fld('Mail', inp('st_email', a?a.email:'')) +
    fld('CMND/CCCD', inp('st_idcard', a?a.idCard:'')) +
    fld('Tỉnh / thành phố', inp('st_province', a?a.province:'')) +
    fld('Quận / Huyện', inp('st_district', a?a.district:'')) +
    fld('Phường / Xã', inp('st_ward', a?a.ward:'')) +
    fld('Địa chỉ thường trú', inp('st_perm', a?a.permanentAddress:'')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu nhân viên</button>' +
    '<button class="btn gray" type="button" onclick="go(\'staff\')">Quay lại</button></div></form>';
  if(a) h += '<p style="color:#757575;max-width:1080px">Đặt lại mật khẩu cho nhân viên này: dùng chức năng ở mục Quản lý → Cài đặt (admin) hoặc API đặt lại mật khẩu.</p>';
  setContent(h);
}
function saveStaff(id){
  var data = { name: val('st_name'), phone: val('st_phone'), role: val('st_role'),
    dob: val('st_dob') || null, gender: val('st_gender'), job: val('st_job'),
    maritalStatus: val('st_marital'), email: val('st_email'), idCard: val('st_idcard'),
    province: val('st_province'), district: val('st_district'), ward: val('st_ward'),
    permanentAddress: val('st_perm') };
  var pr;
  if(id) pr = updateRec('accounts', id, data);
  else { data.password = document.getElementById('st_pw').value || '123456'; data.modules = []; data.houseIds = []; pr = createRec('accounts', data); }
  pr.then(function(){ toast('Đã lưu nhân viên'); go('staff'); }).catch(errToast);
}
VIEWS.staff = viewStaff; VIEWS.staffForm = viewStaffForm;

/* ================================================================
   10) THÔNG BÁO + CÀI ĐẶT THÔNG BÁO (lưu localStorage)
   ================================================================ */
var NOTIF_TYPES = [['incident','Sự cố mới'],['contract','Hợp đồng sắp hết hạn'],['invoice','Hóa đơn chưa thanh toán / quá hạn'],['deposit','Cọc sắp hết hạn']];
function notifSettings(){
  try { return JSON.parse(localStorage.getItem('nhatro_notify_settings') || '{}'); } catch(e){ return {}; }
}
function viewNotifications(){
  api('/notifications').then(function(data){
    var settings = notifSettings();
    var h = pageTitle('Thông báo');
    h += '<div class="card" style="margin-bottom:14px"><h3 class="sec" style="margin-top:0">Cài đặt thông báo</h3>' +
      NOTIF_TYPES.map(function(t){
        var on = settings[t[0]] !== false;
        return '<div class="switch"><span>'+t[1]+'</span><input type="checkbox" style="width:auto" '+(on?'checked':'')+' onchange="toggleNotif(\''+t[0]+'\', this.checked)"></div>';
      }).join('') + '</div>';
    var items = (data.items || []).filter(function(n){ return settings[n.type] !== false; });
    h += items.length ? items.map(function(n){
      return '<div class="notif-item"><div class="time">'+esc(n.time)+'</div><div>'+esc(n.content)+'</div></div>';
    }).join('') : '<div class="empty-note">Chưa có thông báo nào</div>';
    setContent(h);
  }).catch(errToast);
}
function toggleNotif(type, on){
  var s = notifSettings(); s[type] = on;
  try { localStorage.setItem('nhatro_notify_settings', JSON.stringify(s)); } catch(e){}
  viewNotifications();
}
VIEWS.notifications = viewNotifications;

/* ================================================================
   11) QUẢN LÝ — Xe | Tài sản | Sự cố | Đơn vị tính | Khách | Cài đặt
   ================================================================ */
function viewVehicles(){
  var h = pageTitle('Danh sách xe');
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'vehicleForm\')">+ Thêm xe</button></div>';
  h += tableHtml(['STT','Nhà','Phòng','Loại xe','Biển số','Chủ xe','Hãng / Màu','Phí',''], db.vehicles.map(function(v, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(v.houseId))+'</td><td>'+esc(roomName(v.roomId))+'</td><td>'+esc(v.type)+'</td><td><b>'+esc(v.plate)+'</b></td><td>'+esc(v.ownerName)+'</td><td>'+esc((v.brand||'') + ' / ' + (v.color||''))+'</td><td>'+fmt(v.fee)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'vehicleForm\',{id:\''+v.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Xe '+esc(v.plate)+'\',\'vehicles\',\''+v.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có xe nào');
  setContent(h);
}
function viewVehicleForm(p){
  var v = p.id ? byId(db.vehicles, p.id) : null;
  var h = pageTitle(v ? 'Sửa xe' : 'Thêm xe');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveVehicle(\''+(v?v.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('v_house', db.houses, v?v.houseId:'', function(x){ return (x.name||x.address); }), true) +
    fld('Phòng', selObj('v_room', db.rooms, v?v.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Không chọn --')) +
    fld('Loại xe', sel('v_type', ['Xe máy','Ô tô','Xe đạp'], v?v.type:'Xe máy')) +
    fld('Biển số', inp('v_plate', v?v.plate:'')) + fld('Chủ xe', inp('v_owner', v?v.ownerName:'')) +
    fld('Hãng xe', inp('v_brand', v?v.brand:'')) + fld('Màu', inp('v_color', v?v.color:'')) +
    fld('Phí (vnđ)', inp('v_fee', v?v.fee:0, 'number')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'vehicles\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveVehicle(id){
  var room = byId(db.rooms, val('v_room'));
  var data = { houseId: room ? room.houseId : val('v_house'), roomId: val('v_room') || null,
    type: val('v_type'), plate: val('v_plate'), ownerName: val('v_owner'),
    brand: val('v_brand'), color: val('v_color'), fee: num(val('v_fee')) };
  var pr = id ? updateRec('vehicles', id, data) : createRec('vehicles', data);
  pr.then(function(){ toast('Đã lưu xe'); go('vehicles'); }).catch(errToast);
}
function viewAssets(){
  var counts = {};
  db.assets.forEach(function(a){ counts[a.status] = (counts[a.status]||0) + 1; });
  var h = pageTitle('Tài sản');
  h += '<div class="grid-stats">' + ['Mới','Như mới','Tốt','Cũ','Hỏng','Mất'].map(function(s){
    return '<div class="stat"><div class="num">'+(counts[s]||0)+'</div><div class="lbl">'+s+'</div></div>'; }).join('') + '</div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'assetForm\')">+ Thêm tài sản</button></div>';
  h += tableHtml(['STT','Nhà','Phòng','Mã TS','Loại tài sản','Trạng thái',''], db.assets.map(function(a, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(a.houseId))+'</td><td>'+esc(roomName(a.roomId))+'</td><td>'+esc(a.code)+'</td><td><b>'+esc(a.type)+'</b></td><td>'+esc(a.status)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'assetForm\',{id:\''+a.id+'\'})">Cập nhật</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Tài sản '+esc(a.type)+'\',\'assets\',\''+a.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có tài sản nào');
  setContent(h);
}
function viewAssetForm(p){
  var a = p.id ? byId(db.assets, p.id) : null;
  var h = pageTitle(a ? 'Cập nhật tài sản' : 'Thêm tài sản');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveAsset(\''+(a?a.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('a_house', db.houses, a?a.houseId:'', function(x){ return (x.name||x.address); }), true) +
    fld('Phòng', selObj('a_room', db.rooms, a?a.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Cả nhà --')) +
    fld('Mã tài sản', inp('a_code', a?a.code:'')) + fld('Loại tài sản', inp('a_type', a?a.type:''), true) +
    fld('Trạng thái', sel('a_status', ['Mới','Như mới','Tốt','Cũ','Hỏng','Mất'], a?a.status:'Tốt')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'assets\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveAsset(id){
  var room = byId(db.rooms, val('a_room'));
  var data = { houseId: room ? room.houseId : val('a_house'), roomId: val('a_room') || null,
    code: val('a_code'), type: val('a_type'), status: val('a_status') };
  var pr = id ? updateRec('assets', id, data) : createRec('assets', data);
  pr.then(function(){ toast('Đã lưu tài sản'); go('assets'); }).catch(errToast);
}
var incFilter = {};
function incBadge(s){ return s==='Đã sửa' ? '<span class="badge b-done">Đã sửa</span>' : (s==='Đang sửa' ? '<span class="badge b-fixing">Đang sửa</span>' : (s==='Tiếp nhận sự cố' ? '<span class="badge b-received">Tiếp nhận sự cố</span>' : '<span class="badge b-new">Chưa sửa</span>')); }
function viewIncidents(){
  var f = incFilter;
  var h = pageTitle('Sự cố');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('icf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Loại</label>'+sel('icf_type', [['','Tất cả'],['Hỏng điện','Hỏng điện'],['Hỏng nước','Hỏng nước'],['Hỏng mạng','Hỏng mạng'],['Khác','Khác']], f.type||'')+'</div>' +
    '<div class="fg"><label>Trạng thái</label>'+sel('icf_status', [['','Tất cả'],['Chưa sửa','Chưa sửa'],['Tiếp nhận sự cố','Tiếp nhận sự cố'],['Đang sửa','Đang sửa'],['Đã sửa','Đã sửa']], f.status||'')+'</div>' +
    '<button class="btn" onclick="incFilter={houseId:val(\'icf_house\'),type:val(\'icf_type\'),status:val(\'icf_status\')};viewIncidents()">Lọc</button>' +
    '<button class="btn green" onclick="go(\'incidentForm\')">+ Thêm sự cố</button></div>';
  var list = db.incidents.filter(function(x){
    if(f.houseId && x.houseId !== f.houseId) return false;
    if(f.type && x.type !== f.type) return false;
    if(f.status && x.status !== f.status) return false;
    return true;
  });
  h += tableHtml(['STT','Nhà','Phòng','Loại','Nội dung','SDT','Ngày','Trạng thái','Người tiếp nhận',''], list.map(function(x, i){
    var acts = '';
    if(x.status === 'Chưa sửa') acts += '<button class="linkbtn" onclick="incAdvance(\''+x.id+'\',\'Tiếp nhận sự cố\')">Tiếp nhận sự cố</button>';
    if(x.status === 'Tiếp nhận sự cố') acts += '<button class="linkbtn" onclick="incAdvance(\''+x.id+'\',\'Đang sửa\')">Đang xử lý</button>';
    if(x.status === 'Đang sửa') acts += '<button class="linkbtn" onclick="incAdvance(\''+x.id+'\',\'Đã sửa\')">Hoàn thành</button>';
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(x.houseId))+'</td><td>'+esc(roomName(x.roomId))+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.note)+'</td><td>'+esc(x.phone)+'</td><td>'+fmtDate(x.date)+'</td><td>'+incBadge(x.status)+'</td><td>'+esc(x.assignee||'')+'</td>' +
      '<td class="act">'+acts+'<button class="linkbtn red" onclick="delBtn(\'Sự cố '+esc(x.type)+'\',\'incidents\',\''+x.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có sự cố nào');
  setContent(h);
}
function incAdvance(id, status){
  var data = { status: status };
  if(status === 'Tiếp nhận sự cố' && currentUser) data.assignee = currentUser.name;
  updateRec('incidents', id, data).then(function(){ toast('Đã chuyển trạng thái: ' + status); viewIncidents(); }).catch(errToast);
}
function viewIncidentForm(){
  var h = pageTitle('Thêm sự cố');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveIncident()"><div class="fgrid">' +
    fld('Nhà', selObj('ic_house', db.houses, '', function(x){ return (x.name||x.address); }), true) +
    fld('Phòng', selObj('ic_room', db.rooms, '', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Cả nhà --')) +
    fld('Loại sự cố', sel('ic_type', ['Hỏng điện','Hỏng nước','Hỏng mạng','Khác'], 'Khác')) +
    fld('SDT người gặp sự cố', inp('ic_phone', '')) +
    fld('Ngày', inp('ic_date', today(), 'date')) +
    '</div>' + fld('Ghi chú', '<textarea id="ic_note"></textarea>') +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu sự cố</button>' +
    '<button class="btn gray" type="button" onclick="go(\'incidents\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveIncident(){
  var room = byId(db.rooms, val('ic_room'));
  createRec('incidents', { houseId: room ? room.houseId : val('ic_house'), roomId: val('ic_room') || null,
    type: val('ic_type'), phone: val('ic_phone'), note: val('ic_note'), status: 'Chưa sửa',
    creator: currentUser ? currentUser.name : '', date: val('ic_date') || today() })
    .then(function(){ toast('Đã thêm sự cố'); go('incidents'); }).catch(errToast);
}
function viewUnits(){
  var h = pageTitle('Đơn vị tính');
  h += '<form class="filters" onsubmit="event.preventDefault();saveUnit()">' +
    '<div class="fg"><label>Tên đơn vị mới</label>'+inp('un_name', '', 'text', 'placeholder="VD: lượt"')+'</div>' +
    '<button class="btn green">+ Thêm đơn vị</button></form>';
  h += tableHtml(['STT','Tên đơn vị',''], db.units.map(function(u, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(u.name)+'</b></td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Đơn vị '+esc(u.name)+'\',\'units\',\''+u.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có đơn vị nào');
  setContent(h);
}
function saveUnit(){
  if(!val('un_name')){ toast('Nhập tên đơn vị'); return; }
  createRec('units', { name: val('un_name') }).then(function(){ toast('Đã thêm đơn vị'); go('units'); }).catch(errToast);
}
function viewCustomers(){
  var h = pageTitle('Khách thuê');
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'customerForm\')">+ Thêm khách</button></div>';
  h += tableHtml(['STT','Họ tên','SDT','Giới tính','Ngày sinh','Email','CMND','Phòng đang ở',''], db.customers.map(function(c, i){
    var ct = db.contracts.filter(function(x){ return x.customerId === c.id && x.status === 'active'; })[0];
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(c.name)+'</b></td><td>'+esc(c.phone)+'</td><td>'+esc(c.gender)+'</td><td>'+fmtDate(c.dob)+'</td><td>'+esc(c.email||'')+'</td><td>'+esc(c.idCard||'')+'</td><td>'+(ct ? esc(roomName(ct.roomId)) : '—')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'customerForm\',{id:\''+c.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Khách '+esc(c.name)+'\',\'customers\',\''+c.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có khách nào');
  setContent(h);
}
function viewCustomerForm(p){
  var c = p.id ? byId(db.customers, p.id) : null;
  var h = pageTitle(c ? 'Sửa khách thuê' : 'Thêm khách thuê');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveCustomer(\''+(c?c.id:'')+'\')"><div class="fgrid">' +
    fld('Họ tên', inp('cm_name', c?c.name:''), true) + fld('Ngày sinh', inp('cm_dob', c?c.dob:'', 'date')) +
    fld('SDT', inp('cm_phone', c?c.phone:'')) + fld('Giới tính', sel('cm_gender', ['Nam','Nữ','Khác'], c?c.gender:'Nam')) +
    fld('Email', inp('cm_email', c?c.email:'')) + fld('CMND/CCCD', inp('cm_idcard', c?c.idCard:'')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'customers\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveCustomer(id){
  var data = { name: val('cm_name'), dob: val('cm_dob') || null, phone: val('cm_phone'),
    gender: val('cm_gender'), email: val('cm_email'), idCard: val('cm_idcard') };
  var pr = id ? updateRec('customers', id, data) : createRec('customers', data);
  pr.then(function(){ toast('Đã lưu khách'); go('customers'); }).catch(errToast);
}
function viewSettings(){
  var u = currentUser || {};
  var h = pageTitle('Cài đặt');
  h += '<div class="card"><h3 class="sec" style="margin-top:0">Thông tin tài khoản</h3>' +
    '<div class="kv"><span>Họ tên</span><span>'+esc(u.name||'')+'</span></div>' +
    '<div class="kv"><span>Số điện thoại</span><span>'+esc(u.phone||'')+'</span></div>' +
    '<div class="kv"><span>Vai trò</span><span>'+esc(roleLabel(u.role))+'</span></div></div>';
  h += '<form class="form-card" style="margin-top:14px" onsubmit="event.preventDefault();changePw()"><h3 class="sec" style="margin-top:0">Đổi mật khẩu</h3>' +
    fld('Mật khẩu cũ', inp('pw_old', '', 'password'), true) +
    fld('Mật khẩu mới (≥ 6 ký tự)', inp('pw_new', '', 'password'), true) +
    '<div class="btnrow"><button class="btn" type="submit">Đổi mật khẩu</button></div></form>';
  if(u.role === 'admin'){
    h += '<form class="form-card" style="margin-top:14px" onsubmit="event.preventDefault();adminResetPw()"><h3 class="sec" style="margin-top:0">Admin đặt lại mật khẩu cho tài khoản</h3><div class="fgrid">' +
      fld('Tài khoản', selObj('rp_acc', db.accounts, '', function(a){ return a.name + ' — ' + a.phone; })) +
      fld('Mật khẩu mới', inp('rp_pw', '', 'password')) + '</div>' +
      '<div class="btnrow"><button class="btn orange" type="submit">Đặt lại mật khẩu</button></div></form>';
    h += '<div class="card" style="margin-top:14px"><h3 class="sec" style="margin-top:0">Dữ liệu mẫu</h3>' +
      '<p style="color:#616161">Xóa toàn bộ dữ liệu hiện tại và nạp lại dữ liệu mẫu như ban đầu.</p>' +
      '<div class="btnrow"><button class="btn red" onclick="reseed()">Xóa dữ liệu & nạp lại dữ liệu mẫu</button></div></div>';
  }
  h += '<div class="btnrow"><button class="btn gray" onclick="doLogout()">Đăng xuất</button></div>';
  setContent(h);
}
function changePw(){
  api('/auth/change-password', 'POST', { old_password: document.getElementById('pw_old').value,
    new_password: document.getElementById('pw_new').value })
    .then(function(){ toast('Đã đổi mật khẩu thành công'); }).catch(errToast);
}
function adminResetPw(){
  var id = val('rp_acc'), pw = document.getElementById('rp_pw').value;
  if(!id || !pw){ toast('Chọn tài khoản và nhập mật khẩu mới'); return; }
  api('/accounts/' + id + '/reset-password', 'POST', { new_password: pw })
    .then(function(){ toast('Đã đặt lại mật khẩu'); }).catch(errToast);
}
function reseed(){
  if(!confirm('Xóa toàn bộ dữ liệu và nạp lại dữ liệu mẫu?')) return;
  api('/seed', 'POST', {}).then(function(){ return loadAll(); })
    .then(function(){ toast('Đã nạp lại dữ liệu mẫu'); go('dashboard'); }).catch(errToast);
}
VIEWS.vehicles = viewVehicles; VIEWS.vehicleForm = viewVehicleForm;
VIEWS.assets = viewAssets; VIEWS.assetForm = viewAssetForm;
VIEWS.incidents = viewIncidents; VIEWS.incidentForm = viewIncidentForm;
VIEWS.units = viewUnits; VIEWS.customers = viewCustomers; VIEWS.customerForm = viewCustomerForm;
VIEWS.settings = viewSettings;

/* ================================================================
   KHỞI ĐỘNG — có token thì kiểm tra /auth/me rồi vào app
   ================================================================ */
(function boot(){
  var tk = getToken();
  if(!tk){ showLogin(); return; }
  api('/auth/me').then(function(user){ currentUser = user; bootApp(); })
    .catch(function(){ setToken(null); showLogin(); });
})();
