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
        /* Đợt 11: verify-password trả 401 khi nhập SAI mật khẩu — đó là lỗi nhập
           liệu, không phải hết phiên: không được đăng xuất người dùng (trước đây
           nhập sai mật khẩu ở modal Xóa là bị văng ra màn hình đăng nhập). */
        if(res.status === 401 && getToken() && path !== '/auth/login' && path !== '/auth/verify-password'){ setToken(null); currentUser = null; showLogin('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
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
/* ----- Chống bấm Lưu liên tục (đợt 25): khóa nút Lưu trong lúc request lưu
   đang chạy, mở lại khi xong/lỗi. Khóa theo từng form (key) nên bấm đúp chỉ
   tạo 1 request; lớp chặn trùng ở backend vẫn là quyết định cuối cùng
   (kể cả khi request vẫn lọt qua, vd gọi API trực tiếp). unlockSave gọi
   nhiều lần cũng an toàn (xóa cờ + mở nút, không làm gì thêm). */
var saveLocks = {};
function lockSave(key){
  if(saveLocks[key]) return false;
  saveLocks[key] = true;
  document.querySelectorAll('form button[type=submit]').forEach(function(b){ b.disabled = true; });
  return true;
}
function unlockSave(key){
  delete saveLocks[key];
  document.querySelectorAll('form button[type=submit]').forEach(function(b){ b.disabled = false; });
}

/* ---------- Tiện ích ---------- */
function fmt(n){ n = Math.round(Number(n)||0); return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'đ'; }
function fmtNum(n){ return (Math.round(Number(n)||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function num(v){ var x = parseInt(String(v==null?'':v).replace(/[^\d-]/g,''),10); return isNaN(x)?0:x; }
/* ----- Định dạng tiền khi gõ: phân cách hàng nghìn bằng dấu chấm -----
   - Ô vnđ (data-money="vnd"): chỉ số nguyên, nhóm 3 chữ số
     (1000000 -> "1.000.000"); khi lưu num() đã bỏ dấu chấm nên payload
     vẫn là số thuần.
   - Ô triệu (data-money="trieu"): giữ phần thập phân, chỉ nhóm phần
     nguyên; dấu phẩy là thập phân VN ("4,5" = 4.5 triệu), còn dấu chấm
     đi kèm đúng 3 chữ số là phân cách nghìn ("1.200" = 1200 triệu,
     khác "4.5" = 4.5 triệu). numTrieu() dùng chung splitMoneyParts
     nên parse đúng cả hai dạng.
   - Gõ được áp dụng qua listener 'input' (capture) bên dưới để các
     handler oninput khác (vd lcFormRefresh) đọc giá trị đã định dạng. */
function groupIntStr(d){ return String(d).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function splitMoneyParts(raw, isTrieu){
  var s = String(raw == null ? '' : raw).trim();
  if(!s) return null;
  if(!isTrieu) return { int: s.replace(/\D/g, ''), dec: '', pending: false };
  var ci = s.indexOf(',');
  if(ci >= 0) return { int: s.slice(0, ci).replace(/\D/g, ''), dec: s.slice(ci + 1).replace(/\D/g, ''), pending: ci === s.length - 1 };
  if(/^\d{1,3}(\.\d{3})+$/.test(s)) return { int: s.replace(/\./g, ''), dec: '', pending: false };
  var m = s.match(/^(.*)\.(\d{1,2})$/);
  if(m) return { int: m[1].replace(/\D/g, ''), dec: m[2], pending: false };
  if(/\.$/.test(s)) return { int: s.replace(/\D/g, ''), dec: '', pending: true };
  return { int: s.replace(/\D/g, ''), dec: '', pending: false };
}
function fmtMoneyDisplay(raw, isTrieu){
  var p = splitMoneyParts(raw, isTrieu);
  if(!p || !p.int) return '';
  var int = p.int.replace(/^0+(?=\d)/, '');
  if(!int) int = '0';
  var out = groupIntStr(int);
  if(isTrieu && (p.dec || p.pending)) out += ',' + p.dec;
  return out;
}
function moneyFmt(el){
  if(!el) return;
  var isTrieu = el.getAttribute('data-money') === 'trieu';
  var raw = el.value, caret = 0;
  try { caret = el.selectionStart || 0; } catch(e){}
  var atEnd = caret >= raw.length;
  var digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
  var disp = fmtMoneyDisplay(raw, isTrieu);
  el.value = disp;
  var pos;
  if(atEnd) pos = disp.length;
  else {
    pos = 0; var seen = 0;
    while(pos < disp.length && seen < digitsBefore){ if(/\d/.test(disp[pos])) seen++; pos++; }
  }
  try { el.setSelectionRange(pos, pos); } catch(e){}
}
document.addEventListener('input', function(ev){
  var el = ev.target;
  if(el && el.classList && el.classList.contains('money')) moneyFmt(el);
}, true);
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
function inp(id, value, type, extra){
  /* Ô tiền: type 'money' (vnđ) / 'money-trieu' (triệu) render thành
     input text có class money + data-money, giá trị nạp sẵn đã được
     định dạng phân cách nghìn; gõ được moneyFmt() định dạng trực tiếp
     qua listener 'input' (capture) ở trên. */
  if(type === 'money' || type === 'money-trieu'){
    var isTr = type === 'money-trieu';
    var disp = (value === '' || value == null) ? '' : fmtMoneyDisplay(String(value), isTr);
    return '<input id="'+id+'" type="text" inputmode="'+(isTr ? 'decimal' : 'numeric')+'" class="money" data-money="'+(isTr ? 'trieu' : 'vnd')+'" value="'+esc(disp)+'" '+(extra||'')+'>';
  }
  return '<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(value==null?'':value)+'" '+(extra||'')+'>';
}
function sel(id, options, current, extra){
  var h='<select id="'+id+'"'+(extra ? ' '+extra : '')+'>';
  options.forEach(function(o){ var v=Array.isArray(o)?o[0]:o, t=Array.isArray(o)?o[1]:o;
    h+='<option value="'+esc(v)+'"'+(String(v)===String(current)?' selected':'')+'>'+esc(t)+'</option>'; });
  return h+'</select>';
}
function selObj(id, arr, current, labelFn, allLabel, extra){
  var opts = allLabel!==undefined ? [['', allLabel]] : [];
  arr.forEach(function(o){ opts.push([o.id, labelFn(o)]); });
  return sel(id, opts, current, extra);
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
function sentBadge(inv){ return inv && inv.sent ? '<span class="badge b-paid">Đã gửi</span>' : '<span class="badge b-unpaid">Chưa gửi</span>'; }
function fmtDT(iso){
  if(!iso) return '';
  var s = String(iso).replace('T',' '), parts = s.split(' '), d = parts[0].split('-'), t = (parts[1]||'').slice(0,5);
  if(d.length === 3) return d[0] + '/' + Number(d[1]) + '/' + Number(d[2]) + (t ? ' ' + t : '');
  return iso;
}
/* ----- Hồ sơ khách đầy đủ (dùng lại ở form HĐ, form cọc, form khách) ----- */
function custFieldsHtml(p, c){
  c = c || {};
  return '<div class="fgrid">' +
    fld('Họ tên', inp(p+'_name', c.name||''), true) +
    avatarPhHtml() +
    fld('Ngày sinh', inp(p+'_dob', c.dob||'', 'date')) +
    fld('Địa chỉ thường trú', inp(p+'_perm', c.permanentAddress||'')) +
    fld('SDT', inp(p+'_phone', c.phone||''), true) +
    fld('Giới tính', sel(p+'_gender', ['Nam','Nữ','Khác'], c.gender||'Nam')) +
    fld('Nghề nghiệp', inp(p+'_job', c.job||'')) +
    fld('Tình trạng hôn nhân', inp(p+'_marital', c.maritalStatus||'')) +
    fld('Mail', inp(p+'_email', c.email||'')) +
    fld('CMND/CCCD', inp(p+'_idcard', c.idCard||'')) +
    fld('Địa chỉ hiện tại', inp(p+'_curr', c.currentAddress||'')) +
    fld('Ghi chú', inp(p+'_note', c.note||'')) +
    '</div>';
}
function collectCust(p){
  return { name: val(p+'_name'), dob: val(p+'_dob') || null, phone: val(p+'_phone'),
    gender: val(p+'_gender'), email: val(p+'_email'), idCard: val(p+'_idcard'),
    job: val(p+'_job'), maritalStatus: val(p+'_marital'),
    permanentAddress: val(p+'_perm'), currentAddress: val(p+'_curr'), note: val(p+'_note') };
}
/* Đợt 5: 2 ô placeholder ảnh CMND (mặt trước/sau — chỉ minh họa theo thiết kế,
   không upload thật) dùng ở form nhà / cọc / hợp đồng / khách. */
function cmndPhotosHtml(){
  return '<div><label class="fl">Ảnh CMND/CCCD (minh họa)</label><div style="display:flex;gap:10px">' +
    '<div class="img-ph">🪪<br>Mặt trước CMND</div><div class="img-ph">🪪<br>Mặt sau CMND</div></div></div>';
}
/* Ô avatar placeholder (form chủ nhà / khách) */
function avatarPhHtml(){
  return '<div><label class="fl">Ảnh đại diện</label><div class="avatar-ph">👤</div></div>';
}
/* ================================================================
   ĐỢT 6 — 1) Địa chỉ hành chính VN dạng select xếp tầng (dữ liệu tĩnh
   đóng gói trong vn-admin.js: window.VN_ADMIN, không gọi API ngoài);
   2) Tải ảnh thật lên server qua POST /api/upload (JWT).
   ================================================================ */
function vnAdminData(){ return window.VN_ADMIN || []; }
function locProvinces(){ return vnAdminData().map(function(p){ return p[0]; }); }
function locDistricts(province){
  var p = vnAdminData().filter(function(x){ return x[0] === province; })[0];
  return p ? p[1].map(function(d){ return d[0]; }) : [];
}
function locWards(province, district){
  var p = vnAdminData().filter(function(x){ return x[0] === province; })[0];
  if(!p) return [];
  var d = p[1].filter(function(x){ return x[0] === district; })[0];
  return d ? d[1].slice() : [];
}
function locFill(id, names, current){
  var el = document.getElementById(id); if(!el) return;
  var list = names.slice();
  /* Giá trị đã lưu không có trong dữ liệu chuẩn (vd tên phường cũ trước khi
     sáp nhập hành chính) vẫn được giữ làm 1 lựa chọn để không mất dữ liệu */
  if(current && list.indexOf(current) < 0) list.unshift(current);
  el.innerHTML = '<option value="">-- Chọn --</option>' + list.map(function(n){
    return '<option value="'+esc(n)+'"'+(n === current ? ' selected' : '')+'>'+esc(n)+'</option>';
  }).join('');
}
function locInit(prefix, vals){
  vals = vals || {};
  locFill(prefix + '_province', locProvinces(), vals.province || '');
  locFill(prefix + '_district', vals.province ? locDistricts(vals.province) : [], vals.district || '');
  locFill(prefix + '_ward', (vals.province && vals.district) ? locWards(vals.province, vals.district) : [], vals.ward || '');
}
function locProvinceChanged(prefix){
  var pv = val(prefix + '_province');
  locFill(prefix + '_district', locDistricts(pv), '');
  locFill(prefix + '_ward', [], '');
}
function locDistrictChanged(prefix){
  locFill(prefix + '_ward', locWards(val(prefix + '_province'), val(prefix + '_district')), '');
}
function locSelectHtml(prefix, kind){
  var fn = kind === 'province' ? 'locProvinceChanged' : (kind === 'district' ? 'locDistrictChanged' : '');
  return '<select id="'+prefix+'_'+kind+'"'+(fn ? ' onchange="'+fn+'(\''+prefix+'\')"' : '')+'></select>';
}
/* ----- Upload ảnh lên server (multipart + JWT) -> Promise<url> ----- */
function uploadImageFile(file){
  if(file.size > 5 * 1024 * 1024) return Promise.reject(new Error('Ảnh "'+file.name+'" vượt quá 5MB'));
  var fd = new FormData(); fd.append('file', file);
  var headers = {}; var tk = getToken(); if(tk) headers['Authorization'] = 'Bearer ' + tk;
  return fetch('/api/upload', { method: 'POST', headers: headers, body: fd }).then(function(res){
    return res.text().then(function(txt){
      var data = null; try{ data = txt ? JSON.parse(txt) : null; }catch(e){}
      if(!res.ok) throw new Error((data && data.detail) || ('Lỗi ' + res.status));
      return data.url;
    });
  });
}
/* Bộ chọn 1 ảnh dùng chung: hidden input id=base giữ URL; các phần tử phụ
   có id base+'_thumb' / base+'_ph' / base+'_file' / base+'_del' */
function imgPickInner(base, url, thumbCls){
  return '<input type="hidden" id="'+base+'" value="'+esc(url || '')+'">' +
    '<img id="'+base+'_thumb" class="'+(thumbCls || 'asset-thumb')+'" src="'+esc(url || '')+'" alt="Ảnh đã tải lên"'+(url ? '' : ' style="display:none"')+'>' +
    '<div class="img-ph" id="'+base+'_ph" style="padding:8px 4px"'+(url ? ' style="display:none"' : '')+'>🖼️<br>Chưa có ảnh</div>' +
    '<input type="file" id="'+base+'_file" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none" onchange="pickImageFile(\''+base+'\')">' +
    '<div class="btnrow" style="margin:6px 0 0">' +
    '<button type="button" class="btn sm gray" onclick="document.getElementById(\''+base+'_file\').click()">📷 Chọn ảnh</button>' +
    '<button type="button" class="btn sm red" id="'+base+'_del" onclick="clearPickedImage(\''+base+'\')"'+(url ? '' : ' style="display:none"')+'>Bỏ ảnh</button></div>';
}
function imagePickerHtml(base, url, label, thumbCls){
  return '<div><label class="fl">'+esc(label || 'Ảnh')+'</label>' + imgPickInner(base, url, thumbCls) + '</div>';
}
function setPickedImage(base, url){
  var hidden = document.getElementById(base); if(hidden) hidden.value = url || '';
  var img = document.getElementById(base + '_thumb');
  if(img){ img.src = url || ''; img.style.display = url ? '' : 'none'; }
  var ph = document.getElementById(base + '_ph'); if(ph) ph.style.display = url ? 'none' : '';
  var del = document.getElementById(base + '_del'); if(del) del.style.display = url ? '' : 'none';
}
function clearPickedImage(base){ setPickedImage(base, ''); }
function pickImageFile(base){
  var input = document.getElementById(base + '_file');
  var f = input && input.files && input.files[0];
  if(!f) return;
  input.value = '';
  toast('Đang tải ảnh lên...');
  uploadImageFile(f).then(function(url){ setPickedImage(base, url); toast('Đã tải ảnh lên'); }).catch(errToast);
}
/* 2 ô tải ảnh CMND/CCCD thật (mặt trước / mặt sau) cho hồ sơ CHỦ NHÀ —
   prefix 'l' ở form nhà, 'll' ở form chủ nhà (Quản lý) */
function landlordCmndHtml(l, prefix){
  var one = function(base, url, sub){
    return '<div style="flex:1;min-width:140px"><div style="font-size:12.5px;color:#616161;margin-bottom:4px">'+sub+'</div>' +
      imgPickInner(base, url, 'doc-thumb') + '</div>';
  };
  return '<div><label class="fl">Ảnh CMND/CCCD (tải lên thật)</label><div style="display:flex;gap:10px;flex-wrap:wrap">' +
    one(prefix + '_cmnd_front', l ? (l.idCardImage1 || '') : '', 'Mặt trước') +
    one(prefix + '_cmnd_back', l ? (l.idCardImage2 || '') : '', 'Mặt sau') +
    '</div></div>';
}
/* ----- Ảnh sổ đỏ của nhà: nhiều ảnh, lưới thumbnail, xóa từng ảnh ----- */
function rbRender(){
  var grid = document.getElementById('rb_grid'); if(!grid) return;
  var list = window._rbImages || [];
  grid.innerHTML = list.length ? list.map(function(u, i){
    return '<div class="rb-cell"><img class="rb-thumb" src="'+esc(u)+'" alt="Ảnh sổ đỏ">' +
      '<button type="button" class="rb-x" title="Xóa ảnh này" onclick="rbRemove('+i+')">✕</button></div>';
  }).join('') : '<div class="img-ph" style="padding:10px 6px;flex:1">📕<br>Chưa có ảnh sổ đỏ</div>';
}
function rbPickFiles(){
  var input = document.getElementById('rb_file');
  var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
  if(input) input.value = '';
  if(!files.length) return;
  window._rbImages = window._rbImages || [];
  toast('Đang tải ' + files.length + ' ảnh sổ đỏ lên...');
  var chain = Promise.resolve();
  files.forEach(function(f){
    chain = chain.then(function(){ return uploadImageFile(f); }).then(function(url){
      window._rbImages.push(url); rbRender();
    });
  });
  chain.then(function(){ toast('Đã tải ảnh sổ đỏ lên'); }).catch(function(e){ errToast(e); rbRender(); });
}
function rbRemove(i){ (window._rbImages || []).splice(i, 1); rbRender(); }
/* ----- Vị trí trên bản đồ của nhà (đợt 7): Leaflet + OpenStreetMap -----
   Thư viện Leaflet đóng gói tĩnh trong frontend/leaflet/; chỉ các ô gạch
   (tiles) nạp từ OpenStreetMap qua mạng. Bấm bản đồ / kéo ghim -> đồng bộ
   2 ô tọa độ h_lat/h_lng; nhập tay tọa độ -> ghim nhảy tới. Mất mạng vẫn
   dùng được form: tiles không nạp được thì bản đồ trống, nhập tay vẫn chạy. */
var HOUSE_MAP_DEFAULT = [21.0285, 105.8542]; /* Hà Nội */
function houseMapParse(v){
  var x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(x) ? null : x;
}
function houseMapValid(lat, lng){
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function houseMapCoords(){
  var lat = houseMapParse(val('h_lat')), lng = houseMapParse(val('h_lng'));
  return houseMapValid(lat, lng) ? { lat: lat, lng: lng } : null;
}
function houseMapSyncInputs(lat, lng){
  var la = document.getElementById('h_lat'), lo = document.getElementById('h_lng');
  if(la) la.value = Math.round(lat * 1e7) / 1e7;
  if(lo) lo.value = Math.round(lng * 1e7) / 1e7;
  var gg = document.getElementById('h_gg_link');
  if(gg) gg.href = 'https://www.google.com/maps?q=' + lat + ',' + lng;
}
function houseMapSetPos(lat, lng, zoom){
  houseMapSyncInputs(lat, lng);
  var st = window._hmap; if(!st || typeof L === 'undefined') return;
  if(!st.marker){
    var mopts = { draggable: true };
    if(window._hmapIcon) mopts.icon = window._hmapIcon;
    st.marker = L.marker([lat, lng], mopts).addTo(st.map);
    st.marker.on('dragend', function(){
      var p = st.marker.getLatLng();
      houseMapSetPos(p.lat, p.lng);
    });
  } else st.marker.setLatLng([lat, lng]);
  st.map.setView([lat, lng], zoom || st.map.getZoom());
}
function houseMapInit(hs){
  var el = document.getElementById('h_map_el'); if(!el) return;
  if(window._hmap && window._hmap.map){ try{ window._hmap.map.remove(); }catch(e){} window._hmap = null; }
  if(typeof L === 'undefined'){
    el.innerHTML = '<div class="img-ph" style="height:100%;display:flex;align-items:center;justify-content:center;padding:12px">🗺️ Không tải được thư viện bản đồ — vẫn nhập tọa độ thủ công ở 2 ô Vĩ độ/Kinh độ bên dưới.</div>';
    return;
  }
  try{
    window._hmapIcon = L.icon({
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=',
      iconRetinaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAABSCAMAAAAhFXfZAAAC91BMVEVMaXEzeak2f7I4g7g3g7cua5gzeKg8hJo3grY4g7c3grU0gLI2frE0daAubJc2gbQwd6QzeKk2gLMtd5sxdKIua5g1frA2f7IydaM0e6w2fq41fK01eqo3grgubJgta5cxdKI1f7AydaQydaMxc6EubJgvbJkwcZ4ubZkwcJwubZgubJcydqUydKIxapgubJctbJcubZcubJcvbJYubJcvbZkubJctbJctbZcubJg2f7AubJcrbZcubJcubJcua5g3grY0fq8ubJcubJdEkdEwhsw6i88vhswuhcsuhMtBjMgthMsrg8srgss6is8qgcs8i9A9iMYtg8spgcoogMo7hcMngMonf8olfso4gr8kfck5iM8jfMk4iM8he8k1fro7itAgesk2hs8eecgzfLcofssdeMg0hc4cd8g2hcsxeLQbdsgZdcgxeLImfcszhM0vda4xgckzhM4xg84wf8Yxgs4udKsvfcQucqhUndROmdM1fK0wcZ8vb5w0eqpQm9MzeKhXoNVcpdYydKNWn9VZotVKltJFjsIwcJ1Rms9OlslLmtH///8+kc9epdYzd6dbo9VHkMM2f7FHmNBClM8ydqVcpNY9hro3gLM9hLczealQmcw3fa46f7A8gLMxc6I3eagyc6FIldJMl9JSnNRSntNNl9JPnNJFi75UnM9ZodVKksg8kM45jc09e6ZHltFBk883gbRBh7pDk9EwcaBzn784g7dKkcY2i81Om9M7j85Llc81is09g7Q4grY/j9A0eqxKmdFFltBEjcXf6fFImdBCiLxJl9FGlNFBi78yiMxVndEvbpo6js74+vx+psPP3+o/ks5HkcpGmNCjwdZCkNDM3ehYoNJEls+lxNkxh8xHks0+jdC1zd5Lg6r+/v/H2ufz9/o3jM3t8/edvdM/k89Th61OiLBSjbZklbaTt9BfptdjmL1AicBHj8hGk9FAgK1dkLNTjLRekrdClc/k7fM0icy0y9tgp9c4jc2NtM9Dlc8zicxeXZn3AAAAQ3RSTlMAHDdTb4yPA+LtnEQmC4L2EmHqB7XA0d0sr478x4/Yd5i1zOfyPkf1sLVq4Nh3FvjxopQ2/STNuFzUwFIwxKaejILpIBEV9wAABhVJREFUeF6s1NdyFEcYBeBeoQIhRAkLlRDGrhIgY3BJL8CVeKzuyXFzzjkn5ZxzzuScg3PO8cKzu70JkO0LfxdTU//pM9vTu7Xgf6KqOVTb9X7toRrVEfBf1HTVjZccrT/2by1VV928Yty9ZbVuucdz90frG8DBjl9pVApbOstvmMuvVgaNXSfAAd6pGxpy6yxf5ph43pS/4f3uoaGm2rdu72S9xzOvMymkZFq/ptDrk90mhW7e4zl7HLzhxGWPR20xmSxJ/VqldG5m9XhaVOA1DadsNh3Pu5L2N6QtPO/32JpqQBVVk20oy/Pi2s23WEvyfHbe1thadVQttvm7Llf65gGmXK67XtupyoM7HQhmXdLS8oGWJNeOJ3C5fG5XCEJnkez3/oFdsvgJ4l2ANZwhrJKk/7OSXa+3Vw2WJMlKnGkobouYk6T0TyX30klOUnTD9HJ5qpckL3EW/w4XF3Xd0FGywXUrstrclVsqz5Pd/sXFYyDnPdrLcQODmGOK47IZb4CmibmMn+MYRzFZ5jg33ZL/EJrWcszHmANy3ARBK/IXtciJy8VsitPSdE3uuHxzougojcUdr8/32atnz/ev3f/K5wtpxUTpcaI45zusVDpYtZi+jg0oU9b3x74h7+n9ABvYEZeKaVq0sh0AtLKsFtqNBdeT0MrSzwwlq9+x6xAO4tgOtSzbCjrNQQiNvQUbUEubvzBUeGw26yDCsRHCoLkTHDa7IdOLIThs/gHvChszh2CimE8peRs47cxANI0lYNB5y1DljpOF0IhzBDPOZnDOqYYbeGKECbPzWnXludPphw5c2YBq5zlwXphIbO4VDCZ0gnPfUO1TwZoYwAs2ExPCedAu9DAjfQUjzITQb3jNj0KG2Sgt6BHaQUdYzWz+XmBktOHwanXjaSTcwwziBcuMOtwBmqPrTOxFQR/DRKKPqyur0aiW6cULYsx6tBm0jXpR/AUWR6HRq9WVW6MRhIq5jLyjbaCTDCijyYJNpCajdyobP/eTw0iexBAKkJ3gA5KcQb2zBXsIBckn+xVv8jkZSaEFHE+jFEleAEfayRU0MouNoBmB/L50Ai/HSLIHxcrpCvnhSQAuakKp2C/YbCylJjXRVy/z3+Kv/RrNcCo+WUzlVEhzKffnTQnxeN9fWF88fiNCUdSTsaufaChKWInHeysygfpIqagoakW+vV20J8uyl6TyNKEZWV4oRSPyCkWpgOLSbkCObT8o2r6tlG58HQquf6O0v50tB7JM7F4EORd2dx/K0w/KHsVkLPaoYrwgP/y7krr3SSMA4zj+OBgmjYkxcdIJQyQRKgg2viX9Hddi9UBb29LrKR7CVVEEEXWojUkXNyfTNDE14W9gbHJNuhjDettN3ZvbOvdOqCD3Jp/9l+/wJE+9PkYGjx/fqkys3S2rMozM/o2106rfMUINo6hVqz+eu/hd1c4xTg0TAfy5kV+4UG6+IthHTU9woWmxuKNbTfuCSfovBCxq7EtHqvYL4Sm6F8GVxsSXHMQ07TOi1DKtZxjWaaIyi4CXWjxPccUw8WVbMYY5wxC1mzEyXMJWkllpRloi+Kkoq69sxBTlElF6aAxYUbjXNlhlDZilDnM4U5SlN5biRsRHnbx3mbeWjEh4mEyiuJDl5XcWVmX5GvNkFgLWZM5qwsop4/AWfLhU1cR7k1VVvcYCWRkOI6Xy5gmnphCYIkvzuNYzHzosq2oNk2RtSs8khfUOfHIDgR6ysYBaMpl4uEgk2U/oJTs9AaTSwma7dT69geAE2ZpEjUsn2ieJNHeKfrI3EcAGJ2ZaNgVuC8EBctCLc57P5u5led6IOBkIYkuQMrmmjChs4VkfOerHqSBkPzZlhe06RslZ3zMjk2sscqKwY0RcjKK+LWbzd7KiHhkncs/siFJ+V5eXxD34B8nVuJEpGJNmxN2gH3vSvp7J70tF+D1Ej8qUJD1TkErAND2GZwTFg/LubvmgiBG3SOvdlsqFQrkEzJCL1rstlnVFROixZoDDSuXQFHESwVGlcuQcMb/b42NgjLowh5MTDFE3vNB5qStRIErdCQEh6pLPR92anSUb/wAIhldAaDMpGgAAAABJRU5ErkJggg==',
      shadowUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    var saved = (hs && houseMapValid(hs.latitude, hs.longitude)) ? { lat: hs.latitude, lng: hs.longitude } : null;
    var map = L.map(el).setView(saved ? [saved.lat, saved.lng] : HOUSE_MAP_DEFAULT, saved ? 16 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    window._hmap = { map: map, marker: null };
    map.on('click', function(e){ houseMapSetPos(e.latlng.lat, e.latlng.lng); });
    if(saved) houseMapSetPos(saved.lat, saved.lng, 16);
    setTimeout(function(){ try{ map.invalidateSize(); }catch(e){} }, 150);
  }catch(e){
    el.innerHTML = '<div class="img-ph" style="height:100%;display:flex;align-items:center;justify-content:center;padding:12px">🗺️ Không khởi tạo được bản đồ — vẫn nhập tọa độ thủ công ở 2 ô Vĩ độ/Kinh độ bên dưới.</div>';
  }
}
function houseMapCoordsChanged(){
  var c = houseMapCoords(); if(!c) return;
  houseMapSetPos(c.lat, c.lng);
}
function houseMapGeocode(q){
  if(!q){ toast('Hãy nhập địa chỉ cần tìm'); return; }
  toast('Đang tìm vị trí trên bản đồ...');
  fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&accept-language=vi&q=' + encodeURIComponent(q),
    { headers: { 'Accept': 'application/json' } })
    .then(function(r){ return r.json(); })
    .then(function(rs){
      if(rs && rs.length){
        houseMapSetPos(parseFloat(rs[0].lat), parseFloat(rs[0].lon), 16);
        toast('Đã tìm thấy vị trí');
      } else toast('Không tìm thấy địa chỉ này trên bản đồ');
    })
    .catch(function(){ toast('Không tìm được — hãy kiểm tra kết nối mạng'); });
}
function houseMapSearch(){ houseMapGeocode(val('h_geo_q')); }
function houseMapFromAddress(){
  var parts = [val('h_address'), val('h_ward'), val('h_district'), val('h_province')].filter(function(x){ return !!x; });
  if(!parts.length){ toast('Hãy nhập Địa chỉ + Phường/Quận/Tỉnh trong form trước'); return; }
  houseMapGeocode(parts.join(', '));
}
/* Chọn khách có sẵn -> tự điền hồ sơ vào các ô prefix (dùng cho form cọc) */
function custPickInto(prefix, selId){
  var c = byId(db.customers, val(selId));
  var map = { name:'_name', dob:'_dob', permanentAddress:'_perm', phone:'_phone', gender:'_gender',
    job:'_job', maritalStatus:'_marital', email:'_email', idCard:'_idcard', currentAddress:'_curr', note:'_note' };
  Object.keys(map).forEach(function(k){
    var e = document.getElementById(prefix + map[k]); if(e) e.value = c ? (c[k] || '') : '';
  });
}
function lastReading(roomId, type){
  var list = db.meterReadings.filter(function(m){ return m.roomId===roomId && m.type===type; });
  list.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });
  return list.length? list[list.length-1] : null;
}
/* Đợt 8: cộng tháng có kẹp ngày cuối tháng (vd 31/01 + 1 tháng -> 28/02) */
function addMonthsClamped(iso, months){
  var p = String(iso||'').split('-'); if(p.length !== 3) return '';
  var y = Number(p[0]), m = Number(p[1]) + months, d = Number(p[2]);
  y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  var last = new Date(y, m, 0).getDate();
  return y + '-' + String(m).padStart(2,'0') + '-' + String(Math.min(d, last)).padStart(2,'0');
}
/* Hàm CHUNG suy ra "Ngày thanh toán tiếp theo" của 1 hợp đồng chủ nhà
   (Đợt 8 lập hàm, Đợt 9 chỉnh thứ tự neo). Đây là ngày SUY RA — chỉ dùng cho
   bộ lọc "Sắp đến hạn thanh toán", cột cùng tên ở Danh sách nhà và màn hình
   chi tiết nhà; KHÔNG ghi ngược vào dữ liệu đã lưu.
   Neo theo thứ tự ưu tiên: firstPayDate (Ngày thanh toán KỲ ĐẦU do người
   dùng nhập) -> payDate (Thời gian thanh toán cụ thể) -> startDate;
   bước nhảy = payMonths (mặc định 1, tối thiểu 1); từ neo cộng dồn từng bước
   cho đến ngày đầu tiên >= hôm nay. Hợp đồng cũ không có ngày neo nào thì
   fallback về logic payDay theo tháng như trước. */
function nextPayDate(lc){
  if(!lc) return '';
  var anchor = lc.firstPayDate || lc.payDate || lc.startDate || '';
  if(anchor){
    var step = Math.max(1, parseInt(lc.payMonths, 10) || 1);
    var t = today(), cand = anchor, guard = 0;
    while(cand < t && guard++ < 1200) cand = addMonthsClamped(cand, step);
    return cand >= t ? cand : '';
  }
  if(!lc.payDay) return '';
  var tp = today().split('-'), y = Number(tp[0]), m = Number(tp[1]);
  var c2 = y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(lc.payDay,28)).padStart(2,'0');
  if(c2 < today()){ m++; if(m>12){ m=1; y++; } c2 = y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(lc.payDay,28)).padStart(2,'0'); }
  return c2;
}
/* "Quản lý thay chủ" ở form nhà: khi chọn thì phần Hợp Đồng bị ẩn +
   vô hiệu hóa (không cần nhập thông tin hợp đồng nữa), phần Chủ Nhà
   không còn dấu * bắt buộc; bỏ chọn thì trở về đúng hành vi cũ.
   Trạng thái lưu ở houses.managedForOwner, mở form Sửa nhà khôi phục
   đúng trạng thái; khi chọn và lưu thì KHÔNG tạo/cập nhật hợp đồng
   chủ nhà (hợp đồng đã có sẵn vẫn giữ nguyên, không bị xóa). */
function toggleManaged(){
  var m = isChk('lc_managed');
  var sec = document.getElementById('lc_sec');
  if(sec){
    var grid = sec.querySelector('.fgrid');
    if(grid){
      grid.style.display = m ? 'none' : '';
      grid.querySelectorAll('input,select,textarea').forEach(function(e){ e.disabled = m; });
    }
  }
  var ll = document.getElementById('ll_sec');
  if(ll) ll.classList.toggle('no-req', m);
}

/* Cập nhật trực tiếp trong form nhà (phần Hợp Đồng) khi người dùng gõ:
   - "Tổng số tiền thanh toán" (ô chỉ đọc) = Tiền thuê x Số tháng.
   - "Ngày thanh toán kỳ đầu" (lc_firstpay) là ô NGƯỜI DÙNG NHẬP (Đợt 9):
     chỉ điền sẵn GỢI Ý (tính từ Ngày bắt đầu hợp đồng lc_start + payMonths)
     khi ô đang TRỐNG — tuyệt đối không ghi đè giá trị người dùng đã nhập
     hoặc đã lưu, vì ngày kỳ đầu đã lưu là dữ liệu chính thức.
     (Ô "Thời gian thanh toán" lc_paydate đã bỏ khỏi form theo yêu cầu —
     payDate chỉ còn là dữ liệu cũ trong DB, vẫn là 1 neo dự phòng của
     nextPayDate cho các hợp đồng cũ.) */
function lcFormRefresh(){
  var firstEl = document.getElementById('lc_firstpay');
  if(firstEl && !firstEl.value){
    var probe = { startDate: val('lc_start') || null,
      payMonths: num(val('lc_paymonths')) || 1, payDay: 0 };
    firstEl.value = nextPayDate(probe);
  }
  var totEl = document.getElementById('lc_total');
  if(totEl) totEl.value = fmtNum((num(val('lc_rent')) || 0) * (num(val('lc_paymonths')) || 1));
}

/* ---------- Điều hướng ---------- */
var NAVMAP = { dashboard:'dashboard', houses:'houses', houseForm:'houses', houseDetail:'houses', houseUtilities:'houses', utilityForm:'houses',
  rooms:'rooms', roomForm:'rooms', roomDetail:'rooms', deposits:'deposits', depositForm:'deposits',
  contracts:'contracts', contractForm:'contracts', contractDetail:'contracts', liquidate:'contracts', landlordContractForm:'contracts',
  invoices:'invoices', invoiceDetail:'invoices', monthlyForm:'invoices', otherForm:'invoices', specialInvoices:'invoices', specialSend:'invoices', invoiceEdit:'invoices', invoicePrint:'invoices', paymentsAll:'invoices',
  finance:'finance', receiptForm:'finance', expenseForm:'finance',
  staff:'staff', staffForm:'staff', notifications:'notifications',
  incidents:'incidents', incidentForm:'incidents',
  customers:'customers', customerForm:'customers',
  /* Đợt 17: Dịch vụ nằm trong dropdown Quản lý nên sáng mục Quản lý;
     Sự cố/Khách thuê đã ra menu chính nên sáng riêng từng mục. */
  vehicles:'manage', vehicleForm:'manage', assets:'manage', assetForm:'manage', services:'manage', serviceForm:'manage',
  units:'manage', settings:'manage', landlords:'manage', landlordForm:'manage' };
var curView = 'dashboard', curParams = {};
function toggleMenu(ev){ ev.stopPropagation(); document.getElementById('manageMenu').classList.toggle('open'); }
document.addEventListener('click', function(){ var m=document.getElementById('manageMenu'); if(m) m.classList.remove('open'); });
function go(view, params){
  curView = view; curParams = params || {};
  var fn = VIEWS[view];
  if(!fn){ toast('Màn hình chưa có: ' + view); return; }
  document.querySelectorAll('#mainNav [data-nav], #bottomNav [data-nav]').forEach(function(a){
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
function askDelete(label, onOk, warn){
  openModal('<h3>Xác thực mật khẩu để xóa</h3>' +
    '<p style="color:#616161;font-size:14px">Bạn sắp xóa: <b>'+esc(label)+'</b>.<br>Nhập mật khẩu của bạn để xác nhận (theo thiết kế, thao tác Xóa cần xác thực mật khẩu).</p>' +
    (warn ? '<p style="color:#c62828;font-size:14px">'+esc(warn)+'</p>' : '') +
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
function delBtn(label, coll, id, after, warn){
  askDelete(label, function(){
    deleteRecDirect(coll, id).then(function(){ toast('Đã xóa'); (after || function(){ go(curView, curParams); })(); }).catch(errToast);
  }, warn);
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
      return '<div class="notif-item"><div class="time">'+esc(fmtDT(n.time))+'</div><div>'+esc(n.content)+'</div></div>';
    }).join('') : '<div class="empty-note">Chưa có thông báo</div>';
    h += '<div class="btnrow"><button class="btn sm" onclick="go(\'notifications\')">Xem tất cả thông báo</button></div>';
    setContent(h);
  }).catch(errToast);
}

var VIEWS = { dashboard: viewDashboard };

/* ================================================================
   2) NHÀ TRỌ — danh sách + form 3 phần + thanh toán điện nước
   ================================================================ */
var houseFilter = { province:'', district:'', ward:'', name:'', address:'', phone:'',
  payfrom:'', payto:'', soonpay:false, endfrom:'', endto:'', soonend:false };
function houseFullAddr(hs){
  return [hs.address, hs.ward, hs.district, hs.province].filter(function(x){ return x; }).join(', ');
}
function houseLandlordOf(hs){
  var lc = landlordContractOf(hs.id);
  if(lc) return byId(db.landlords, lc.landlordId);
  return hs.landlordId ? byId(db.landlords, hs.landlordId) : null;
}
function viewHouses(){
  var f = houseFilter;
  var provinces = [], districts = [], wards = [];
  db.houses.forEach(function(hs){ if(hs.province && provinces.indexOf(hs.province)<0) provinces.push(hs.province);
    if(hs.district && districts.indexOf(hs.district)<0) districts.push(hs.district);
    if(hs.ward && wards.indexOf(hs.ward)<0) wards.push(hs.ward); });
  var h = pageTitle('Danh sách nhà');
  /* 2 nút điều hướng con ngay dưới menu (đúng thiết kế) */
  h += '<div class="tabs"><span class="tab on">Danh sách nhà</span>' +
    '<span class="tab" onclick="go(\'houseUtilities\')">Thanh toán điện nước</span></div>';
  h += '<div class="filters" style="flex-direction:column;align-items:stretch">' +
    /* Hàng 1: Tỉnh/thành phố — Quận/Huyện — Xã/phường */
    '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    '<div class="fg"><label>Tỉnh/thành phố</label>'+sel('hf_province', [['','Tất cả']].concat(provinces.map(function(x){return [x,x];})), f.province)+'</div>' +
    '<div class="fg"><label>Quận/Huyện</label>'+sel('hf_district', [['','Tất cả']].concat(districts.map(function(x){return [x,x];})), f.district)+'</div>' +
    '<div class="fg"><label>Xã/phường</label>'+sel('hf_ward', [['','Tất cả']].concat(wards.map(function(x){return [x,x];})), f.ward)+'</div></div>' +
    /* Hàng 2: Tên nhà — Địa chỉ — SDT chủ nhà (ô text, gõ là lọc ngay) */
    '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    '<div class="fg"><label>Tên nhà</label>'+inp('hf_name', f.name, 'text', 'placeholder="Nhập tên nhà..."')+'</div>' +
    '<div class="fg"><label>Địa chỉ</label>'+inp('hf_address', f.address, 'text', 'placeholder="Nhập địa chỉ..."')+'</div>' +
    '<div class="fg"><label>SDT chủ nhà</label>'+inp('hf_phone', f.phone, 'text', 'placeholder="Nhập SDT chủ nhà..."')+'</div></div>' +
    /* Hàng 3: Thời gian thanh toán tiếp theo Từ–Đến + Sắp đến hạn thanh toán */
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">' +
    '<div class="fg"><label>Thời gian thanh toán tiếp theo — Từ</label>'+inp('hf_payfrom', f.payfrom, 'date')+'</div>' +
    '<div class="fg"><label>Đến</label>'+inp('hf_payto', f.payto, 'date')+'</div>' +
    '<div class="fg"><label>&nbsp;</label><span>'+chk('hf_soonpay','Sắp đến hạn thanh toán', f.soonpay)+'</span></div></div>' +
    /* Hàng 4: Thời gian kết thúc hợp đồng Từ–Đến + Sắp hết hạn hợp đồng + Xóa bộ lọc */
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">' +
    '<div class="fg"><label>Thời gian kết thúc hợp đồng — Từ</label>'+inp('hf_endfrom', f.endfrom, 'date')+'</div>' +
    '<div class="fg"><label>Đến</label>'+inp('hf_endto', f.endto, 'date')+'</div>' +
    '<div class="fg"><label>&nbsp;</label><span>'+chk('hf_soonend','Sắp hết hạn hợp đồng', f.soonend)+'</span></div>' +
    '<div class="fg"><label>&nbsp;</label><button class="btn gray" type="button" onclick="resetHouseFilter()">Xóa bộ lọc</button></div></div>' +
    '</div>';
  /* Nút Thêm nhà ở góc phải, ngay phía trên bảng */
  h += '<div class="btnrow" style="justify-content:flex-end"><button class="btn green" onclick="go(\'houseForm\')">+ Thêm nhà</button></div>';
  h += '<div id="houseTable"></div>';
  setContent(h);
  renderHouseRows();
  var bindHouse = function(id, key, evt){
    var e = document.getElementById(id); if(!e) return;
    e.addEventListener(evt, function(){ houseFilter[key] = (e.type === 'checkbox') ? e.checked : e.value; renderHouseRows(); });
  };
  bindHouse('hf_province','province','change'); bindHouse('hf_district','district','change'); bindHouse('hf_ward','ward','change');
  bindHouse('hf_name','name','input'); bindHouse('hf_address','address','input'); bindHouse('hf_phone','phone','input');
  bindHouse('hf_payfrom','payfrom','change'); bindHouse('hf_payto','payto','change'); bindHouse('hf_soonpay','soonpay','change');
  bindHouse('hf_endfrom','endfrom','change'); bindHouse('hf_endto','endto','change'); bindHouse('hf_soonend','soonend','change');
}
function resetHouseFilter(){
  houseFilter = { province:'', district:'', ward:'', name:'', address:'', phone:'',
    payfrom:'', payto:'', soonpay:false, endfrom:'', endto:'', soonend:false };
  viewHouses();
}
function renderHouseRows(){
  var wrap = document.getElementById('houseTable'); if(!wrap) return;
  var f = houseFilter;
  var list = db.houses.filter(function(hs){
    var lc = landlordContractOf(hs.id);
    var ll = houseLandlordOf(hs);
    if(f.province && hs.province !== f.province) return false;
    if(f.district && hs.district !== f.district) return false;
    if(f.ward && hs.ward !== f.ward) return false;
    if(f.name && (hs.name || hs.address || '').toLowerCase().indexOf(f.name.toLowerCase()) < 0) return false;
    if(f.address && houseFullAddr(hs).toLowerCase().indexOf(f.address.toLowerCase()) < 0) return false;
    if(f.phone && (!ll || (ll.phone || '').toLowerCase().indexOf(f.phone.toLowerCase()) < 0)) return false;
    var npd = nextPayDate(lc);
    /* Đợt 8 (mục 1): "Sắp đến hạn thanh toán" = ngày TT tiếp theo trong vòng 1,5 tháng (45 ngày) */
    if(f.soonpay && (!npd || diffDays(today(), npd) < 0 || diffDays(today(), npd) > 45)) return false;
    if(f.payfrom && (!npd || npd < f.payfrom)) return false;
    if(f.payto && (!npd || npd > f.payto)) return false;
    if(f.soonend && (!lc || !lc.endDate || diffDays(today(), lc.endDate) < 0 || diffDays(today(), lc.endDate) > 30)) return false;
    if(f.endfrom && (!lc || !lc.endDate || lc.endDate < f.endfrom)) return false;
    if(f.endto && (!lc || !lc.endDate || lc.endDate > f.endto)) return false;
    return true;
  });
  wrap.innerHTML = tableHtml(['STT','Tên nhà','Địa chỉ','Chủ nhà','SDT chủ nhà','Mã hợp đồng','Giá thuê nhà (vnđ)','Tổng số tiền thanh toán','Ngày thanh toán tiếp theo','Ngày kết thúc hợp đồng','Chi tiết','Sửa','Xóa'], list.map(function(hs, i){
    var lc = landlordContractOf(hs.id);
    var ll = houseLandlordOf(hs);
    /* Đợt 8 (mục 4b): Tổng số tiền thanh toán = Tiền thuê x Số tháng thanh toán 1 lần */
    var lcTotal = lc ? (Number(lc.rentPrice) || 0) * Math.max(1, parseInt(lc.payMonths, 10) || 1) : null;
    /* Đợt 9: cột "Ngày thanh toán tiếp theo" dùng CHUNG một giá trị suy ra
       nextPayDate(lc) với bộ lọc "Sắp đến hạn thanh toán" ở trên và màn hình
       chi tiết nhà — không có HĐ/ngày neo thì hiện "—" */
    var npd = nextPayDate(lc);
    return '<tr><td>'+(i+1)+'</td><td><a onclick="go(\'houseDetail\',{id:\''+hs.id+'\'})"><b>'+esc(hs.name || hs.address)+'</b></a></td><td>'+esc(houseFullAddr(hs))+'</td>' +
      '<td>'+esc(ll ? ll.name : '')+'</td><td>'+esc(ll ? ll.phone : '')+'</td><td>'+esc(lc ? (lc.code || '') : '')+'</td>' +
      '<td class="price">'+(lc ? fmtNum(lc.rentPrice) : '')+'</td><td class="price">'+(lc ? fmtNum(lcTotal) : '—')+'</td><td>'+(npd ? fmtDate(npd) : '—')+'</td><td>'+(lc ? fmtDate(lc.endDate) : '')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'houseDetail\',{id:\''+hs.id+'\'})">Chi tiết</button></td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'houseForm\',{id:\''+hs.id+'\'})">Sửa</button></td>' +
      /* Đợt 11: xóa nhà xóa kèm toàn bộ dữ liệu liên quan (backend cascade) nên
         modal cảnh báo trước, và sau khi xóa thì nạp lại toàn bộ dữ liệu để
         không còn bản ghi mồ côi trong cache (phòng, HĐ, hóa đơn của nhà đã xóa) */
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Nhà '+esc(hs.name || hs.address)+'\',\'houses\',\''+hs.id+'\',function(){ loadAll().then(function(){ go(\'houses\'); }).catch(errToast); },\'Xóa nhà sẽ xóa kèm toàn bộ dữ liệu liên quan của nhà này (phòng, hợp đồng, hóa đơn, cọc, tài sản, mã điện/nước...). Hành động này không thể hoàn tác.\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có nhà nào');
}
/* ----- Màn hình CHI TIẾT NHÀ (Đợt 9): bấm tên nhà hoặc nút "Chi tiết" ở
   Danh sách nhà -> xem TOÀN BỘ thông tin của nhà, trình bày theo đúng các
   phần của form Thêm nhà (+ phòng thuộc nhà). Dữ liệu lấy từ cache db đã
   nạp sẵn, không gọi thêm API. Trường trống hiện "—". ----- */
/* Đợt 11: màn hình chi tiết nhà viết lại theo đúng giao diện form Thêm nhà —
   cùng wrapper .form-card, cùng thứ tự 5 phần, cùng tiêu đề .form-sec/.sec và
   lưới trường .fgrid/.fld; chỉ khác là giá trị hiển thị dạng text chỉ đọc thay
   cho input. Phần Phòng thuộc nhà thêm thành phần thứ 6 sau Tài sản. */
function viewHouseDetail(p){
  var hs = p.id ? byId(db.houses, p.id) : null;
  if(!hs){ toast('Không tìm thấy nhà'); go('houses'); return; }
  /* HĐ chủ nhà: ưu tiên HĐ đang hiệu lực (landlordContractOf); nhà chỉ còn
     HĐ đã thanh lý thì vẫn hiện HĐ gần nhất kèm trạng thái của nó */
  var lc = landlordContractOf(hs.id);
  if(!lc){
    var lcs = db.landlordContracts.filter(function(x){ return x.houseId === hs.id; });
    lc = lcs.length ? lcs[lcs.length - 1] : null;
  }
  var ll = houseLandlordOf(hs) || (lc ? byId(db.landlords, lc.landlordId) : null);
  /* Mô tả: tách tiền tố "Vị trí bản đồ: ..." như form nhà vẫn lưu */
  var desc = hs.description || '', mapNote = '';
  if(desc.indexOf('Vị trí bản đồ: ') === 0){ var parts = desc.split('\n'); mapNote = parts[0].slice('Vị trí bản đồ: '.length); desc = parts.slice(1).join('\n'); }
  var huDien = null, huNuoc = null;
  db.houseUtilities.forEach(function(u){ if(u.houseId === hs.id){ if(u.type==='dien' && !huDien) huDien = u; if(u.type==='nuoc' && !huNuoc) huNuoc = u; } });
  var llAssets = db.assets.filter(function(a){ return a.houseId === hs.id && a.owner === 'landlord'; });
  var rooms = db.rooms.filter(function(r){ return r.houseId === hs.id; });
  var cnt = { empty:0, deposited:0, rented:0 };
  rooms.forEach(function(r){ cnt[roomStatus(r)]++; });
  /* Giá trị chỉ đọc trong lưới trường của form: cùng label .fl của fld(),
     phần giá trị là text (không phải input); trống thì hiện "—" */
  var dv = function(v){ return (v === null || v === undefined || String(v).trim() === '') ? '—' : esc(v); };
  var ro = function(v){ return '<div style="padding:9px 2px">' + dv(v) + '</div>'; };
  var roHtml = function(html){ return '<div style="padding:9px 2px">' + html + '</div>'; };
  var btns = '<div class="btnrow"><button class="btn" onclick="go(\'houseForm\',{id:\''+hs.id+'\'})">Sửa nhà</button>' +
    '<button class="btn gray" onclick="go(\'houses\')">Quay lại</button></div>';
  var h = pageTitle('Chi tiết nhà — ' + (hs.name || hs.address)) + btns + '<div class="form-card">';
  /* --- Phần 1: Thông Tin Nhà (đúng thứ tự form: địa chỉ → bản đồ → sổ đỏ → tên/diện tích → mô tả) --- */
  var hasCoords = (hs.latitude != null && hs.longitude != null);
  h += '<div class="form-sec"><h3 class="sec">Thông Tin Nhà</h3><div class="fgrid">' +
    fld('Địa chỉ', ro(hs.address)) +
    fld('Tỉnh / TP', ro(hs.province)) +
    fld('Quận / Huyện', ro(hs.district)) +
    fld('Phường / Xã', ro(hs.ward)) +
    '</div>' +
    /* Khối vị trí bản đồ như form nhưng chỉ xem: khung map-real hiển thị tọa độ
       + link Google Maps, không khởi tạo bản đồ tương tác */
    '<label class="fl">Vị trí trên bản đồ</label>' +
    '<div class="map-real" style="display:flex;align-items:center;justify-content:center;text-align:center">' +
    (hasCoords
      ? '<span>' + esc(hs.latitude + ', ' + hs.longitude) + ' — <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + hs.latitude + ',' + hs.longitude + '">Mở Google Maps ↗</a></span>'
      : '<span>—</span>') +
    '</div>' +
    '<div class="fgrid">' +
    fld('Vĩ độ (latitude)', ro(hasCoords ? hs.latitude : '')) +
    fld('Kinh độ (longitude)', ro(hasCoords ? hs.longitude : '')) +
    '</div>' +
    fld('Ghi chú vị trí trên bản đồ', ro(mapNote)) +
    '<div style="margin-top:6px"><label class="fl">Ảnh sổ đỏ</label>' +
    ((hs.redBookImages && hs.redBookImages.length)
      ? '<div class="rb-grid">' + hs.redBookImages.map(function(u){ return '<a href="'+esc(u)+'" target="_blank" rel="noopener"><img class="rb-thumb" src="'+esc(u)+'" alt="Ảnh sổ đỏ"></a>'; }).join('') + '</div>'
      : '<div style="padding:9px 2px">—</div>') +
    '</div>' +
    '<div class="fgrid">' +
    fld('Tên nhà', ro(hs.name)) +
    fld('Diện tích sàn (m2)', ro(hs.floorArea)) +
    fld('Số tầng', ro(hs.floors)) +
    fld('Số phòng ngủ', ro(hs.bedrooms)) +
    fld('Số nhà vệ sinh', ro(hs.bathrooms)) +
    fld('Loại hình kinh doanh', ro(hs.businessType)) +
    '</div>' + fld('Thêm mô tả', roHtml(desc ? esc(desc).replace(/\n/g, '<br>') : '—')) + '</div>';
  /* --- Phần 2: Chủ Nhà --- */
  var cmndCell = function(label, url){
    return '<div style="flex:1;min-width:140px"><div style="font-size:12.5px;color:#616161;margin-bottom:4px">'+esc(label)+'</div>' +
      (url ? '<a href="'+esc(url)+'" target="_blank" rel="noopener"><img class="doc-thumb" src="'+esc(url)+'" alt="Ảnh CMND '+esc(label)+'"></a>' : '<div>—</div>') + '</div>';
  };
  h += '<div class="form-sec"><h3 class="sec">Chủ Nhà</h3>';
  if(ll){
    h += '<div class="fgrid">' +
      fld('Họ tên', ro(ll.name)) +
      fld('Ngày sinh', ro(ll.dob ? fmtDate(ll.dob) : '')) +
      fld('Địa chỉ thường trú', ro(ll.permanentAddress || ll.address)) +
      fld('SDT', ro(ll.phone)) +
      fld('Giới tính', ro(ll.gender)) +
      fld('Nghề nghiệp', ro(ll.job)) +
      fld('Tình trạng hôn nhân', ro(ll.maritalStatus)) +
      fld('Mail', ro(ll.email)) +
      fld('CMND', ro(ll.idCard)) +
      '</div>' +
      '<div><label class="fl">Ảnh CMND/CCCD</label><div style="display:flex;gap:10px;flex-wrap:wrap">' +
      cmndCell('Mặt trước', ll.idCardImage1) + cmndCell('Mặt sau', ll.idCardImage2) + '</div></div>';
  } else h += '<div class="empty-note">Chưa có thông tin chủ nhà</div>';
  h += '</div>';
  /* --- Phần 3: Hợp Đồng (với chủ nhà) --- */
  h += '<div class="form-sec"><h3 class="sec">Hợp Đồng</h3>';
  if(lc){
    var lcTotal = (Number(lc.rentPrice) || 0) * Math.max(1, parseInt(lc.payMonths, 10) || 1);
    var npd = nextPayDate(lc);
    h += '<div class="fgrid">' +
      fld('Mã hợp đồng', ro(lc.code)) +
      fld('Tiền thuê (vnđ)', roHtml(fmt(lc.rentPrice))) +
      fld('Cọc (vnđ)', roHtml(fmt(lc.deposit))) +
      fld('Ngày bắt đầu', ro(lc.startDate ? fmtDate(lc.startDate) : '')) +
      fld('Ngày kết thúc', ro(lc.endDate ? fmtDate(lc.endDate) : '')) +
      fld('Số tháng thanh toán 1 lần', ro(Math.max(1, parseInt(lc.payMonths, 10) || 1))) +
      /* Dòng "Thời gian thanh toán" cũ chỉ hiện khi HĐ có payDate (dữ liệu cũ) */
      (lc.payDate ? fld('Thời gian thanh toán', ro(fmtDate(lc.payDate))) : '') +
      fld('Ngày thanh toán kỳ đầu', ro(lc.firstPayDate ? fmtDate(lc.firstPayDate) : '')) +
      /* Ngày thanh toán tiếp theo: chỉ hiển thị, suy ra bằng nextPayDate(), không lưu */
      fld('Ngày thanh toán tiếp theo', ro(npd ? fmtDate(npd) : '')) +
      fld('Tổng số tiền thanh toán (vnđ)', roHtml(fmt(lcTotal))) +
      fld('Trạng thái hợp đồng', roHtml(lc.status === 'liquidated' ? '<span class="badge b-gray">Đã thanh lý</span>' : '<span class="badge b-paid">Đang hiệu lực</span>')) +
      '</div>';
  } else h += '<div class="empty-note">Chưa có hợp đồng chủ nhà</div>';
  h += '</div>';
  /* --- Phần 4: Mã Hóa Đơn dịch vụ --- */
  var huFields = function(prefix, label, u){
    return fld(label + ' — Mã hóa đơn', ro(u ? u.customerCode : '')) +
      fld(label + ' — Chủ tài khoản', ro(u ? u.accountHolder : '')) +
      fld(label + ' — Tài khoản', ro(u ? u.username : '')) +
      fld(label + ' — Mật khẩu', roHtml((u && u.password) ? '••••••' : '—'));
  };
  h += '<div class="form-sec"><h3 class="sec">Mã Hóa Đơn dịch vụ</h3><div class="fgrid">' +
    huFields('hu_dien', 'Điện', huDien) + huFields('hu_nuoc', 'Nước', huNuoc) + '</div></div>';
  /* --- Phần 5: Tài sản (của chủ nhà) — mỗi tài sản một dòng fgrid như form --- */
  h += '<div class="form-sec"><h3 class="sec">Tài sản</h3>';
  if(llAssets.length){
    h += llAssets.map(function(a){
      return '<div class="fgrid">' +
        fld('Mã tài sản', ro(a.code)) +
        fld('Loại tài sản', ro(a.type)) +
        fld('Trạng thái', ro(a.status)) +
        fld('Ảnh tài sản', a.imageUrl ? '<a href="'+esc(a.imageUrl)+'" target="_blank" rel="noopener"><img class="asset-thumb-sm" src="'+esc(a.imageUrl)+'" alt="Ảnh tài sản"></a>' : ro('')) +
        fld('Note', ro(a.note)) +
        '</div>';
    }).join('');
  } else h += '<div class="empty-note">Chưa có tài sản</div>';
  h += '</div>';
  /* --- Phần 6: Phòng thuộc nhà (chỉ có ở chi tiết, đặt sau Tài sản) --- */
  h += '<div class="form-sec"><h3 class="sec">Phòng thuộc nhà</h3><div class="fgrid">' +
    fld('Tổng số phòng', ro(rooms.length)) +
    fld('Phòng trống', ro(cnt.empty)) +
    fld('Phòng đã cọc', ro(cnt.deposited)) +
    fld('Phòng đã thuê', ro(cnt.rented)) +
    '</div>' +
    tableHtml(['Phòng','Tầng','Giá','Trạng thái'], rooms.map(function(r){
      return '<tr><td><a onclick="go(\'roomDetail\',{id:\''+r.id+'\'})"><b>'+esc(r.name)+'</b></a></td><td>'+dv(r.floor)+'</td>' +
        '<td class="price">'+fmt(r.price)+'</td><td>'+statusBadge(roomStatus(r))+'</td></tr>';
    }).join(''), 'Chưa có phòng nào') + '</div>';
  h += '</div>' + btns;
  setContent(h);
}
/* Đợt 5: Loại hình kinh doanh đúng 4 lựa chọn của ảnh thiết kế form nhà */
var HOUSE_BUSINESS_TYPES = ['Homestay','Chung cư mini','Phòng đơn','Phòng trọ'];
var ASSET_STATUSES = ['Mới','Như mới','Cũ','Hỏng','Mất','Tốt'];
var HOUSE_ASSET_TYPES = ['Tivi','Tủ lạnh','Điều hòa','Máy giặt','Giường','Tủ quần áo','Bàn ghế','Nóng lạnh','Khác'];
function houseLandlordPick(){
  var l = byId(db.landlords, val('h_landlordSel'));
  var map = { name:'l_name', dob:'l_dob', permanentAddress:'l_perm', phone:'l_phone', gender:'l_gender',
    job:'l_job', maritalStatus:'l_marital', email:'l_email', idCard:'l_idcard' };
  Object.keys(map).forEach(function(k){
    var e = document.getElementById(map[k]); if(e) e.value = l ? (l[k] || '') : '';
  });
  /* Đợt 6 (mục 4): đồng bộ cả 2 ảnh CMND của chủ nhà được chọn */
  setPickedImage('l_cmnd_front', l ? (l.idCardImage1 || '') : '');
  setPickedImage('l_cmnd_back', l ? (l.idCardImage2 || '') : '');
}
function addHouseAssetRow(type, status, note, assetId, imageUrl){
  var i = window._haCount = (window._haCount || 0) + 1;
  var wrap = document.getElementById('ha_rows'); if(!wrap) return;
  var types = HOUSE_ASSET_TYPES.slice();
  if(type && types.indexOf(type) < 0) types.unshift(type);
  var existed = assetId ? byId(db.assets, assetId) : null;
  var div = document.createElement('div');
  div.className = 'fgrid'; div.id = 'ha_row_' + i;
  if(assetId) div.setAttribute('data-aid', assetId);
  div.innerHTML = (existed ? '<div><label class="fl">Mã tài sản</label><div style="padding:9px 2px;font-weight:600">'+esc(existed.code || '')+'</div></div>' : '') +
    '<div>'+fld('Loại tài sản', sel('ha_type_'+i, types, type||'Tivi'))+'</div>' +
    '<div>'+fld('Trạng thái', sel('ha_status_'+i, ASSET_STATUSES, status||'Tốt'))+'</div>' +
    /* Đợt 6 (mục 2): ảnh tài sản tải lên thật, xem trước ngay trong dòng */
    imagePickerHtml('ha_img_'+i, imageUrl || (existed ? (existed.imageUrl || '') : ''), 'Ảnh tài sản') +
    '<div>'+fld('Note', inp('ha_note_'+i, note||''))+'</div>' +
    '<div><label class="fl">&nbsp;</label><button type="button" class="btn sm red" onclick="document.getElementById(\'ha_row_'+i+'\').remove()">Xóa dòng</button></div>';
  wrap.appendChild(div);
}
function viewHouseForm(p){
  var hs = p.id ? byId(db.houses, p.id) : null;
  var lc = hs ? landlordContractOf(hs.id) : null;
  var ll = lc ? byId(db.landlords, lc.landlordId) : (hs && hs.landlordId ? byId(db.landlords, hs.landlordId) : null);
  var desc = hs ? (hs.description||'') : '', mapNote = '';
  if(desc.indexOf('Vị trí bản đồ: ') === 0){ var parts = desc.split('\n'); mapNote = parts[0].slice('Vị trí bản đồ: '.length); desc = parts.slice(1).join('\n'); }
  var huDien = null, huNuoc = null;
  if(hs) db.houseUtilities.forEach(function(u){ if(u.houseId === hs.id){ if(u.type==='dien' && !huDien) huDien = u; if(u.type==='nuoc' && !huNuoc) huNuoc = u; } });
  var llAssets = hs ? db.assets.filter(function(a){ return a.houseId === hs.id && a.owner === 'landlord'; }) : [];
  var h = pageTitle(hs ? 'Sửa nhà' : 'Thêm nhà');
  /* Đợt 5: form nhà là 1 TRANG CUỘN với 5 phần hiện cùng lúc (không còn tab) */
  h += '<form class="form-card" onsubmit="event.preventDefault();saveHouse(\''+(hs?hs.id:'')+'\')">' +
    /* --- Phần 1: Thông Tin Nhà --- */
    '<div class="form-sec"><h3 class="sec">Thông Tin Nhà</h3><div class="fgrid">' +
    fld('Địa chỉ', inp('h_address', hs?hs.address:''), true) +
    /* Đợt 6 (mục 1): Tỉnh/Quận/Phường là select xếp tầng theo dữ liệu hành chính VN (vn-admin.js) */
    fld('Tỉnh / TP', locSelectHtml('h', 'province'), true) +
    fld('Quận / Huyện', locSelectHtml('h', 'district'), true) +
    fld('Phường / Xã', locSelectHtml('h', 'ward'), true) +
    '</div>' +
    /* Đợt 7: bản đồ thật Leaflet + OpenStreetMap — bấm/kéo ghim, 2 ô tọa độ
       đồng bộ 2 chiều, tìm địa chỉ qua Nominatim; init ở houseMapInit() */
    '<label class="fl">Vị trí trên bản đồ</label>' +
    '<div class="map-tools">' +
    '<input id="h_geo_q" type="text" placeholder="Tìm địa chỉ trên bản đồ (vd: 372 Xã Đàn, Đống Đa, Hà Nội)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();houseMapSearch();}">' +
    '<button type="button" class="btn sm" onclick="houseMapSearch()">🔍 Tìm</button>' +
    '<button type="button" class="btn sm gray" onclick="houseMapFromAddress()">Tìm theo địa chỉ đã nhập</button></div>' +
    '<div id="h_map_el" class="map-real"></div>' +
    '<div class="fgrid">' +
    fld('Vĩ độ (latitude)', inp('h_lat', (hs && hs.latitude != null) ? hs.latitude : '', 'text', 'inputmode="decimal" onchange="houseMapCoordsChanged()"')) +
    fld('Kinh độ (longitude)', inp('h_lng', (hs && hs.longitude != null) ? hs.longitude : '', 'text', 'inputmode="decimal" onchange="houseMapCoordsChanged()"')) +
    '</div>' +
    (hs ? '<div class="map-gg"><a id="h_gg_link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + ((hs.latitude != null && hs.longitude != null) ? (hs.latitude + ',' + hs.longitude) : 'Hà Nội') + '">Mở Google Maps ↗</a></div>' : '') +
    fld('Ghi chú vị trí trên bản đồ', inp('h_map', mapNote)) +
    /* Đợt 6 (mục 5): Ảnh sổ đỏ — tải nhiều ảnh thật qua /api/upload */
    '<div style="margin-top:6px"><label class="fl">Ảnh sổ đỏ</label>' +
    '<div id="rb_grid" class="rb-grid"></div>' +
    '<input type="file" id="rb_file" accept="image/png,image/jpeg,image/gif,image/webp" multiple style="display:none" onchange="rbPickFiles()">' +
    '<div class="btnrow" style="margin:6px 0 0"><button type="button" class="btn sm gray" onclick="document.getElementById(\'rb_file\').click()">📷 Thêm ảnh sổ đỏ</button></div></div>' +
    '<div class="fgrid">' +
    fld('Tên nhà', inp('h_name', hs?hs.name:''), true) +
    fld('Diện tích sàn (m2)', inp('h_area', hs?hs.floorArea:0, 'number'), true) +
    fld('Số tầng', inp('h_floors', hs?hs.floors:1, 'number'), true) +
    fld('Số phòng ngủ', inp('h_bedrooms', hs?hs.bedrooms:0, 'number'), true) +
    fld('Số nhà vệ sinh', inp('h_bathrooms', hs?hs.bathrooms:0, 'number'), true) +
    fld('Loại hình kinh doanh', sel('h_business', HOUSE_BUSINESS_TYPES, hs?hs.businessType:'Phòng trọ'), true) +
    '</div>' + fld('Thêm mô tả', '<textarea id="h_desc">'+esc(desc)+'</textarea>') + '</div>' +
    /* --- Phần 2: Chủ Nhà --- */
    '<div class="form-sec" id="ll_sec"><h3 class="sec">Chủ Nhà</h3>' +
    fld('Chọn chủ nhà có sẵn (chọn là tự điền hồ sơ bên dưới, sửa được; để trống = tạo chủ nhà mới)', '<select id="h_landlordSel" onchange="houseLandlordPick()">' +
      '<option value="">-- Nhập chủ nhà mới --</option>' + db.landlords.map(function(l){
        return '<option value="'+l.id+'"'+(ll && ll.id===l.id ? ' selected' : '')+'>'+esc(l.name + ' — ' + (l.phone||''))+'</option>'; }).join('') + '</select>') +
    '<div class="fgrid">' +
    fld('Họ tên', inp('l_name', ll?ll.name:''), true) +
    avatarPhHtml() +
    fld('Ngày sinh', inp('l_dob', ll?ll.dob:'', 'date'), true) +
    fld('Địa chỉ thường trú', inp('l_perm', ll?ll.permanentAddress:''), true) +
    fld('SDT', inp('l_phone', ll?ll.phone:''), true) +
    fld('Giới tính', sel('l_gender', ['Nam','Nữ','Khác'], ll?ll.gender:'Nam'), true) +
    fld('Nghề nghiệp', inp('l_job', ll?ll.job:'')) +
    fld('Tình trạng hôn nhân', inp('l_marital', ll?ll.maritalStatus:'')) +
    fld('Mail', inp('l_email', ll?ll.email:'')) +
    fld('CMND', inp('l_idcard', ll?ll.idCard:''), true) +
    /* Đợt 6 (mục 4): ảnh CMND chủ nhà tải lên thật (mặt trước / mặt sau) */
    landlordCmndHtml(ll, 'l') +
    '</div></div>' +
    /* --- Phần 3: Hợp Đồng (với chủ nhà) --- */
    /* "Tổng số tiền thanh toán" là ô chỉ đọc tự cập nhật (hàm lcFormRefresh).
       Đợt 9: bỏ ô "Ngày thanh toán tiếp theo" tự gen khỏi form — thay bằng ô
       date NHẬP TAY "Ngày thanh toán kỳ đầu" (lc_firstpay, lưu vào
       firstPayDate của HĐ): sửa nhà thì nạp ngày đã lưu, chưa có thì
       lcFormRefresh() điền sẵn gợi ý tính từ Ngày bắt đầu để người dùng sửa.
       Ô "Thời gian thanh toán" (lc_paydate/payDate, thêm ở đợt 8) đã BỎ
       khỏi form theo yêu cầu — form không gửi payDate nữa, giá trị cũ trong
       DB được giữ nguyên (API update dùng exclude_unset). */
    '<div class="form-sec" id="lc_sec"><h3 class="sec">Hợp Đồng</h3>' +
    '<div style="margin:2px 0 10px"><label class="chk"><input type="checkbox" id="lc_managed"'+(hs && hs.managedForOwner ? ' checked' : '')+' onchange="toggleManaged()"> Quản lý thay chủ</label></div><div class="fgrid">' +
    fld('Tiền thuê (vnđ)', inp('lc_rent', lc?lc.rentPrice:0, 'money', 'oninput="lcFormRefresh()"'), true) +
    fld('Cọc (vnđ)', inp('lc_deposit', lc?lc.deposit:0, 'money'), true) +
    fld('Ngày bắt đầu', inp('lc_start', lc?lc.startDate:'', 'date', 'onchange="lcFormRefresh()"'), true) +
    fld('Ngày kết thúc', inp('lc_end', lc?lc.endDate:'', 'date'), true) +
    fld('Số tháng thanh toán 1 lần', inp('lc_paymonths', lc?lc.payMonths:1, 'number', 'oninput="lcFormRefresh()" onchange="lcFormRefresh()"'), true) +
    fld('Ngày thanh toán kỳ đầu', inp('lc_firstpay', lc ? (lc.firstPayDate || '') : '', 'date', 'onchange="lcFormRefresh()"')) +
    fld('Tổng số tiền thanh toán (vnđ)', inp('lc_total', '', 'text', 'readonly')) +
    '</div></div>' +
    /* --- Phần 4: Mã Hóa Đơn dịch vụ --- */
    '<div class="form-sec"><h3 class="sec">Mã Hóa Đơn dịch vụ</h3><div class="fgrid">' +
    fld('Điện — Mã hóa đơn', inp('hu_dien_code', huDien?huDien.customerCode:''), true) +
    fld('Điện — Chủ tài khoản', inp('hu_dien_holder', huDien?huDien.accountHolder:'')) +
    fld('Điện — Tài khoản', inp('hu_dien_user', huDien?huDien.username:'')) +
    fld('Điện — Mật khẩu', inp('hu_dien_pass', huDien?huDien.password:'')) +
    fld('Nước — Mã hóa đơn', inp('hu_nuoc_code', huNuoc?huNuoc.customerCode:''), true) +
    fld('Nước — Chủ tài khoản', inp('hu_nuoc_holder', huNuoc?huNuoc.accountHolder:'')) +
    fld('Nước — Tài khoản', inp('hu_nuoc_user', huNuoc?huNuoc.username:'')) +
    fld('Nước — Mật khẩu', inp('hu_nuoc_pass', huNuoc?huNuoc.password:'')) +
    '</div><p style="color:#616161">Điền Mã hóa đơn điện/nước: khi lưu nhà, hệ thống tự tạo bản ghi thanh toán điện/nước tháng hiện tại (chưa thanh toán) cho nhà này.</p></div>' +
    /* --- Phần 5: Tài sản (của chủ nhà) --- */
    '<div class="form-sec"><h3 class="sec">Tài sản</h3><div id="ha_rows"></div>' +
    '<div class="btnrow"><button type="button" class="btn sm" onclick="addHouseAssetRow()">+ Thêm tài sản</button></div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">'+(hs ? 'Lưu thay đổi' : 'Thêm Nhà')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'houses\')">Quay lại</button></div></form>';
  setContent(h);
  window._haCount = 0;
  /* Đợt 6: nạp select hành chính xếp tầng (chế độ sửa chọn sẵn theo tên đã lưu)
     + danh sách ảnh sổ đỏ đã lưu của nhà */
  locInit('h', { province: hs ? hs.province : 'Hà Nội', district: hs ? hs.district : '', ward: hs ? hs.ward : '' });
  /* Đợt 7: khởi tạo bản đồ thật (ghim tại tọa độ đã lưu, zoom 16; chưa có thì mở Hà Nội) */
  houseMapInit(hs);
  window._rbImages = (hs && Array.isArray(hs.redBookImages)) ? hs.redBookImages.slice() : [];
  rbRender();
  /* Nạp sẵn phần Hợp Đồng: ô Tổng tiền TT (chỉ đọc) + gợi ý Ngày TT kỳ đầu
     nếu ô đang trống (không ghi đè ngày đã lưu/đã nạp ở trên) */
  lcFormRefresh();
  /* Khôi phục trạng thái "Quản lý thay chủ" (nhà đã lưu cờ bật thì phần
     Hợp Đồng vẫn ẩn khi mở form Sửa) */
  toggleManaged();
  /* Chế độ sửa: nạp sẵn các tài sản chủ nhà hiện có của nhà thành từng dòng */
  llAssets.forEach(function(a){ addHouseAssetRow(a.type, a.status, a.note || '', a.id, a.imageUrl || ''); });
}
function saveHouse(id){
  if(!lockSave('house')) return;  // Đợt 25: bấm Thêm nhà liên tục chỉ chạy 1 lần lưu
  var landlordSel = val('h_landlordSel');
  /* "Quản lý thay chủ": phần Hợp Đồng bị ẩn/vô hiệu hóa thì không tạo/
     cập nhật hợp đồng chủ nhà (hợp đồng đã có vẫn giữ nguyên) */
  var managed = isChk('lc_managed');
  /* Đợt 6 (mục 4): hồ sơ chủ nhà trong form (kèm 2 ảnh CMND đã tải lên) —
     chủ nhà có sẵn thì CẬP NHẬT lại hồ sơ (đúng cam kết "chọn là tự điền,
     sửa được" của nhãn select), chưa chọn thì tạo mới khi có họ tên */
  var landlordData = null;
  if(val('l_name')){
    landlordData = { name: val('l_name'), phone: val('l_phone'), address: val('l_perm'),
      dob: val('l_dob') || null, gender: val('l_gender'), job: val('l_job'),
      maritalStatus: val('l_marital'), email: val('l_email'), idCard: val('l_idcard'),
      permanentAddress: val('l_perm'),
      idCardImage1: val('l_cmnd_front'), idCardImage2: val('l_cmnd_back') };
  }
  var mapNote = val('h_map'), desc = val('h_desc');
  var fullDesc = (mapNote ? 'Vị trí bản đồ: ' + mapNote + '\n' : '') + desc;
  // Đọc các dòng tài sản chủ nhà trong form (phần Tài sản): dòng có data-aid
  // là tài sản sẵn có (cập nhật), dòng không có là tài sản thêm mới (tạo mới).
  // Đợt 6: đọc theo id phần tử (ha_type_N/ha_status_N/ha_note_N/ha_img_N)
  // vì dòng nay có thêm input file + hidden của bộ chọn ảnh.
  var assetRows = [];
  document.querySelectorAll('#ha_rows > div').forEach(function(row){
    var m = (row.id || '').match(/^ha_row_(\d+)$/); if(!m) return;
    var i = m[1], tEl = document.getElementById('ha_type_' + i);
    if(tEl && tEl.value.trim())
      assetRows.push({ aid: row.getAttribute('data-aid') || '', type: tEl.value.trim(),
        status: val('ha_status_' + i) || 'Tốt', note: val('ha_note_' + i),
        imageUrl: val('ha_img_' + i) });
  });
  var oldHouse = id ? byId(db.houses, id) : null;
  var proceed = function(landlordId){
    var coords = houseMapCoords();
    var data = { address: val('h_address'), name: val('h_name'), province: val('h_province'),
      district: val('h_district'), ward: val('h_ward'), floors: num(val('h_floors')),
      floorArea: num(val('h_area')), bedrooms: num(val('h_bedrooms')), bathrooms: num(val('h_bathrooms')),
      businessType: val('h_business'),
      /* Đợt 5: "Hình thức cho thuê" đã bỏ khỏi form — giữ nguyên giá trị cũ trong DB */
      rentalMode: oldHouse ? (oldHouse.rentalMode || 'Bao phòng') : 'Bao phòng',
      description: fullDesc, landlordId: landlordId || null,
      managedForOwner: managed,
      /* Đợt 7: tọa độ bản đồ từ 2 ô Vĩ độ/Kinh độ (không hợp lệ -> null) */
      latitude: coords ? coords.lat : null,
      longitude: coords ? coords.lng : null,
      /* Đợt 6 (mục 5): danh sách URL ảnh sổ đỏ */
      redBookImages: (window._rbImages || []).slice() };
    var afterHouse = function(houseId){
      var jobs = [];
      // Hợp đồng chủ nhà (hễ phần Hợp Đồng có nhập tiền thuê thì tạo/cập nhật;
      // riêng khi "Quản lý thay chủ" được chọn thì bỏ qua — không tạo mới,
      // không cập nhật, và tuyệt đối không xóa hợp đồng đã có sẵn)
      var rent = num(val('lc_rent'));
      if(rent && !managed){
        /* Form KHÔNG gửi payDate nữa (ô "Thời gian thanh toán" đã bỏ khỏi
           form): API update dùng exclude_unset nên payDate đã lưu trong DB
           của HĐ cũ được giữ nguyên, không bị xóa trắng. payFromDay/payToDay
           cũng giữ nguyên của HĐ cũ nếu có (không ghi đè dữ liệu cũ). */
        var existedLc = id ? landlordContractOf(id) : null;
        var lcData = { landlordId: landlordId, houseId: houseId, rentPrice: rent,
          deposit: num(val('lc_deposit')), startDate: val('lc_start') || null,
          endDate: val('lc_end') || null,
          /* Đợt 9: Ngày thanh toán kỳ đầu do người dùng nhập ở form (lc_firstpay) */
          firstPayDate: val('lc_firstpay') || null,
          payDay: existedLc ? (existedLc.payDay || 5) : 5,
          payMonths: num(val('lc_paymonths')) || 1, status: 'active' };
        if(existedLc){ lcData.payFromDay = existedLc.payFromDay; lcData.payToDay = existedLc.payToDay; }
        jobs.push(existedLc ? updateRec('landlordContracts', existedLc.id, lcData) : createRec('landlordContracts', lcData));
      }
      // Mã Hóa Đơn dịch vụ -> tạo 2 bản ghi house_utilities (tháng hiện tại, chưa TT)
      [['dien','hu_dien'],['nuoc','hu_nuoc']].forEach(function(pair){
        var code = val(pair[1] + '_code');
        if(!code) return;
        var dup = db.houseUtilities.some(function(u){ return u.houseId === houseId && u.type === pair[0] && u.customerCode === code; });
        if(dup) return;
        jobs.push(createRec('houseUtilities', { houseId: houseId, type: pair[0], customerCode: code,
          username: val(pair[1] + '_user'), password: val(pair[1] + '_pass'),
          accountHolder: val(pair[1] + '_holder'), month: curMonth(), amount: 0, status: 'unpaid' }));
      });
      // Tài sản chủ nhà trong form: dòng sẵn có -> cập nhật, dòng mới -> tạo
      assetRows.forEach(function(r){
        if(r.aid) jobs.push(updateRec('assets', r.aid, { type: r.type, status: r.status, note: r.note, imageUrl: r.imageUrl }));
        else jobs.push(createRec('assets', { houseId: houseId, roomId: null, owner: 'landlord',
          type: r.type, status: r.status, note: r.note, imageUrl: r.imageUrl }));
      });
      Promise.all(jobs).then(function(){
        toast('Đã lưu nhà' + (jobs.length ? ' + hợp đồng/tài khoản điện nước/tài sản kèm theo' : ''));
        go('houses');
        unlockSave('house');
      }).catch(function(e){ errToast(e); unlockSave('house'); });
    };
    if(id) updateRec('houses', id, data).then(function(){ afterHouse(id); }).catch(function(e){ errToast(e); unlockSave('house'); });
    else createRec('houses', data).then(function(hs){ afterHouse(hs.id); }).catch(function(e){ errToast(e); unlockSave('house'); });
  };
  if(landlordSel && landlordData)
    updateRec('landlords', landlordSel, landlordData).then(function(){ proceed(landlordSel); }).catch(function(e){ errToast(e); unlockSave('house'); });
  else if(landlordData) createRec('landlords', landlordData).then(function(l){ proceed(l.id); }).catch(function(e){ errToast(e); unlockSave('house'); });
  else proceed(landlordSel || null);
}

/* ----- Thanh toán điện nước của nhà (house_utilities) ----- */
var utilState = { tab:'dien', name:'', addr:'', code:'', month:'', status:'', historyCode:null, historyType:null };
/* Hiển thị tháng dạng năm/tháng, tháng không có số 0 ở đầu (vd 2020/9) — đúng ảnh thiết kế */
function fmtUtilMonth(m){
  if(!m) return '';
  var p = String(m).split('-');
  if(p.length < 2) return String(m);
  return p[0] + '/' + (parseInt(p[1], 10) || p[1]);
}
function viewHouseUtilities(){
  var st = utilState;
  var h = pageTitle('Thanh toán điện nước của nhà');
  /* Hàng nút điều hướng con (đúng thiết kế): Danh sách nhà | Thanh toán điện nước */
  h += '<div class="tabs"><span class="tab" onclick="go(\'houses\')">Danh sách nhà</span>' +
    '<span class="tab on">Thanh toán điện nước</span></div>';
  /* Tab Điện / Nước: nhãn đơn giản, KHÔNG kèm số đếm "chưa thanh toán" */
  h += '<div class="tabs"><span class="tab'+(st.tab==='dien'?' on':'')+'" onclick="utilState.tab=\'dien\';utilState.historyCode=null;viewHouseUtilities()">Điện</span>' +
    '<span class="tab'+(st.tab==='nuoc'?' on':'')+'" onclick="utilState.tab=\'nuoc\';utilState.historyCode=null;viewHouseUtilities()">Nước</span>' +
    '<span class="tab'+(st.tab==='lm'?' on':'')+'" onclick="utilState.tab=\'lm\';viewHouseUtilities()">Chốt điện nước chủ nhà</span></div>';
  if(st.tab === 'lm'){ setContent(h + landlordMeterHtml()); return; }
  var month = st.month || curMonth(); /* Mặc định lấy tháng hiện tại (đúng ghi chú thiết kế) */
  h += '<div class="filters">' +
    '<div class="fg"><label>Tên nhà</label>'+inp('uf_name', st.name, 'text', 'placeholder="Nhập tên nhà..."')+'</div>' +
    '<div class="fg"><label>Địa chỉ</label>'+inp('uf_addr', st.addr, 'text', 'placeholder="Nhập địa chỉ..."')+'</div>' +
    '<div class="fg"><label>Mã '+(st.tab==='dien'?'điện':'nước')+'</label>'+inp('uf_code', st.code, 'text', 'placeholder="Nhập mã..."')+'</div>' +
    '<div class="fg"><label>Thời gian</label>'+inp('uf_month', month, 'month')+'</div>' +
    '<div class="fg"><label>Trạng thái</label>'+sel('uf_status', [['','Tất cả'],['unpaid','Chưa thanh toán'],['paid','Đã thanh toán']], st.status)+'</div>' +
    '<div class="fg"><label>&nbsp;</label><button class="btn gray" type="button" onclick="resetUtilFilter()">Xóa bộ lọc</button></div></div>';
  h += '<div class="btnrow" style="justify-content:flex-end"><button class="btn green" onclick="go(\'utilityForm\',{type:\''+st.tab+'\'})">+ Thêm hóa đơn tháng mới</button></div>';
  h += '<div id="utilTable"></div>';
  setContent(h);
  renderUtilRows();
  /* Lọc trực tiếp: gõ/chọn là lọc ngay, chỉ vẽ lại bảng nên không mất focus */
  var bindUtil = function(id, key, evt){
    var e = document.getElementById(id); if(!e) return;
    e.addEventListener(evt, function(){ utilState[key] = e.value; utilState.historyCode = null; utilState.historyType = null; renderUtilRows(); });
  };
  bindUtil('uf_name','name','input'); bindUtil('uf_addr','addr','input'); bindUtil('uf_code','code','input');
  bindUtil('uf_month','month','change'); bindUtil('uf_status','status','change');
}
function resetUtilFilter(){
  utilState.name = ''; utilState.addr = ''; utilState.code = ''; utilState.month = ''; utilState.status = '';
  utilState.historyCode = null; utilState.historyType = null;
  viewHouseUtilities();
}
function renderUtilRows(){
  var wrap = document.getElementById('utilTable'); if(!wrap) return;
  var st = utilState;
  var month = st.month || curMonth();
  var list = db.houseUtilities.filter(function(u){
    if(st.historyCode) return u.customerCode === st.historyCode && u.type === st.historyType;
    if(u.type !== st.tab) return false;
    if(st.status && u.status !== st.status) return false;
    if(st.code && (u.customerCode||'').toLowerCase().indexOf(st.code.toLowerCase()) < 0) return false;
    if(month && u.month !== month) return false;
    if(st.name){ var hs1 = byId(db.houses, u.houseId); if(!hs1 || (hs1.name || hs1.address || '').toLowerCase().indexOf(st.name.toLowerCase()) < 0) return false; }
    if(st.addr){ var hs2 = byId(db.houses, u.houseId); if(!hs2 || houseFullAddr(hs2).toLowerCase().indexOf(st.addr.toLowerCase()) < 0) return false; }
    return true;
  });
  if(st.historyCode) list = list.slice().sort(function(a, b){ return (a.month||'').localeCompare(b.month||''); });
  var h = '';
  if(st.historyCode) h += '<div class="err-msg" style="background:#e3f2fd;color:#1565c0;border-color:#90caf9">Đang xem lịch sử của mã <b>'+esc(st.historyCode)+'</b> — <a onclick="exitUtilHistory()">xem tất cả</a></div>';
  h += tableHtml(['STT','Tên nhà','Địa chỉ','Mã '+(st.tab==='dien'?'Điện':'Nước'),'Chủ tài khoản','Tài Khoản','Mật khẩu','Thời gian','Tiền thanh toán',''], list.map(function(u, i){
    var hs = byId(db.houses, u.houseId);
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(hs ? (hs.name || hs.address) : '')+'</b></td><td>'+esc(hs ? houseFullAddr(hs) : '')+'</td><td>'+esc(u.customerCode)+'</td>' +
      '<td>'+esc(u.accountHolder)+'</td><td>'+esc(u.username)+'</td><td>'+esc(u.password)+'</td><td>'+esc(fmtUtilMonth(u.month))+'</td>' +
      '<td class="price">'+(u.amount ? fmtNum(u.amount) : '--------------------')+'</td>' +
      '<td class="act">' +
      (u.status !== 'paid' ? '<button class="linkbtn" onclick="openPayUtility(\''+u.id+'\')">Thanh toán</button>' : '') +
      '<button class="linkbtn" onclick="viewUtilHistory(\''+esc(u.customerCode)+'\',\''+u.type+'\')">Lịch sử</button></td></tr>';
  }).join(''), 'Chưa có dữ liệu điện nước');
  wrap.innerHTML = h;
}
function viewUtilHistory(code, type){ utilState.historyCode = code; utilState.historyType = type; renderUtilRows(); }
function exitUtilHistory(){ utilState.historyCode = null; utilState.historyType = null; renderUtilRows(); }
/* Hộp thoại xác nhận thanh toán: có ô Số tiền thanh toán (điền sẵn số tiền
   hiện có của bản ghi nếu > 0; để trống/0 thì bắt buộc nhập mới xác nhận được) */
function openPayUtility(id){
  var u = byId(db.houseUtilities, id); if(!u) return;
  var hs = byId(db.houses, u.houseId);
  var label = u.type === 'dien' ? 'điện' : 'nước';
  var h = '<h3 style="margin-top:0">Thanh toán '+label+' — '+esc(hs ? (hs.name || hs.address) : '')+'</h3>' +
    '<p style="margin:6px 0">Mã '+label+': <b>'+esc(u.customerCode)+'</b> · Thời gian: <b>'+esc(fmtUtilMonth(u.month))+'</b></p>' +
    '<div><label class="fl">Số tiền thanh toán (vnđ) <b>*</b></label>' +
    inp('pay_amount', u.amount ? u.amount : '', 'money', 'placeholder="Nhập số tiền thanh toán..."') + '</div>' +
    '<p class="err-msg" id="pay_err" style="display:none;margin-top:8px"></p>' +
    '<div class="btnrow"><button class="btn green" type="button" onclick="confirmPayUtility(\''+u.id+'\')">Xác nhận thanh toán</button>' +
    '<button class="btn gray" type="button" onclick="closeModal()">Hủy</button></div>';
  openModal(h);
}
function confirmPayUtility(id){
  var u = byId(db.houseUtilities, id); if(!u) return;
  var amt = num(val('pay_amount'));
  if(!amt || amt <= 0){
    var e = document.getElementById('pay_err');
    if(e){ e.style.display = ''; e.textContent = 'Vui lòng nhập số tiền thanh toán (lớn hơn 0).'; }
    return;
  }
  api('/house-utilities/' + id + '/pay', 'POST', { amount: amt }).then(function(r){
    u.status = 'paid'; u.amount = amt;
    return loadColl('expenses');
  }).then(function(){ closeModal(); toast('Đã thanh toán — phiếu chi đã được tạo tự động'); renderUtilRows(); }).catch(errToast);
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
    fld('Tiền thanh toán (vnđ)', inp('u_amount', u?u.amount:0, 'money')) +
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
VIEWS.houses = viewHouses; VIEWS.houseForm = viewHouseForm; VIEWS.houseDetail = viewHouseDetail;
VIEWS.houseUtilities = viewHouseUtilities;
VIEWS.utilityForm = function(p){
  if(p.lm){ /* form chốt điện nước chủ nhà */
    var h = pageTitle('Chốt điện nước chủ nhà');
    h += '<form class="form-card" onsubmit="event.preventDefault();saveLandlordMeter()"><div class="fgrid">' +
      fld('Nhà', selObj('lm_house', db.houses, '', function(x){ return (x.name||x.address); }), true) +
      fld('Ngày chốt', inp('lm_date', today(), 'date')) +
      fld('Tiền điện (vnđ)', inp('lm_dien', 0, 'money')) + fld('Tiền nước (vnđ)', inp('lm_nuoc', 0, 'money')) +
      fld('Tiền internet (vnđ)', inp('lm_internet', 0, 'money')) + fld('Vệ sinh (vnđ)', inp('lm_vesinh', 0, 'money')) +
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
/* Đúng 14 checkbox tiện ích của thiết kế "Thêm phòng" (SPEC-WEB-2 B).
   'Tivi' không nằm trong form phòng — thuộc nhóm đồ/tài sản, chỉ dùng khi LỌC. */
var AMENITIES = ['Cửa sổ','Ban công','Sân phơi','Thang máy','Điều hòa','Nóng lạnh','Máy giặt','Gác xép','Có chỗ để xe máy','Có chỗ để ô tô','Có chỗ để sạc xe điện','Bảo vệ','Camera','Internet'];
function roomHasTivi(r){
  if((r.amenities || []).indexOf('Tivi') >= 0) return true;
  return db.assets.some(function(a){ return a.roomId === r.id && (a.type || '').indexOf('Tivi') >= 0; });
}
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
    '<div class="fg"><label>Giá từ</label>'+inp('rf_pmin', f.pmin||'', 'money')+'</div>' +
    '<div class="fg"><label>Giá đến</label>'+inp('rf_pmax', f.pmax||'', 'money')+'</div>' +
    '<div class="fg"><label>Số người tối đa ≥</label>'+inp('rf_ppl', f.ppl||'', 'number')+'</div>' +
    '<div class="fg"><label>Tiện ích</label><span>' +
      ['Điều hòa','Nóng lạnh','Máy giặt','Tivi','Ban công','Cửa sổ'].map(function(a){ return chk('rf_am_'+a, a, (f.amenities||[]).indexOf(a)>=0); }).join('') +
      chk('rf_am_park', 'Chỗ gửi xe', (f.amenities||[]).indexOf('__park')>=0) + '</span></div>' +
    '<button class="btn" onclick="applyRoomFilter()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'roomForm\')">+ Thêm phòng</button>' +
    '<button class="btn" onclick="downloadSampleCsv()">Tải file mẫu</button>' +
    '<button class="btn" onclick="document.getElementById(\'csvFile\').click()">Thêm phòng bằng file</button>' +
    '<input type="file" id="csvFile" accept=".csv" style="display:none" onchange="importRoomsCsv(this)">' +
    '<button class="btn gray" onclick="exportRoomsCsv()">Tải file danh sách phòng</button></div>' +
    '<p style="color:#757575;font-size:13px;margin:-4px 0 12px">Import bằng file .csv (mở được bằng Excel): chọn 1 nhà ở bộ lọc phía trên trước, rồi bấm "Thêm phòng bằng file". Giá và cọc trong file tính bằng vnđ, không phải triệu.</p>';
  var list = filteredRooms();
  /* Đợt 27: Cọc/Giá phòng hiển thị theo vnđ cho nhất quán với ô nhập
     (trước đây hiển thị theo TRIỆU thập phân từ đợt 5) */
  h += tableHtml(['STT','Tên nhà','Tầng','Tên phòng','Cọc (vnđ)','Giá phòng (vnđ)','Diện tích (m2)','Loại phòng','Trạng thái','Chung chủ','Vệ sinh','Số phòng','Gác xép','Bếp','Số người tối đa','Dịch vụ','Sửa','Xóa'], list.map(function(r, i){
    var sv = r.services || {};
    var svNames = Object.keys(sv).filter(function(k){ return k!=='extra' && sv[k] && (sv[k].price || sv[k].fee); }).map(function(k){
      return {dien:'Điện',dienChung:'Điện chung',internet:'Internet',nuoc:'Nước',vesinh:'Vệ sinh',xeMay:'Xe máy',oTo:'Ô tô',xeDap:'Xe đạp'}[k] || k; });
    (sv.extra || []).forEach(function(x){ if(x && x.name) svNames.push(x.name); });
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(r.houseId))+'</td><td>'+r.floor+'</td>' +
      '<td><a onclick="go(\'roomDetail\',{id:\''+r.id+'\'})"><b>'+esc(r.name)+'</b></a></td>' +
      '<td>'+fmt(r.minDeposit)+'</td><td class="price">'+fmt(r.price)+'</td><td>'+r.area+'</td><td>'+esc(r.type)+'</td>' +
      '<td>'+statusBadge(roomStatus(r))+'</td><td>'+(r.withOwner?'Có':'Không')+'</td><td>'+esc(r.toilet)+'</td><td>'+(r.subRooms||0)+'</td>' +
      '<td>'+((r.amenities||[]).indexOf('Gác xép')>=0?'Có':'Không')+'</td><td>'+esc(r.kitchen||'Không có')+'</td><td>'+r.maxPeople+'</td><td>'+esc(svNames.join(', '))+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'roomForm\',{id:\''+r.id+'\'})">Sửa</button></td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Phòng '+esc(r.name)+'\',\'rooms\',\''+r.id+'\')">Xóa</button></td></tr>';
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
      else if(ams[i]==='Tivi'){ if(!roomHasTivi(r)) return false; }
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
  /* Đợt 14: file mẫu import phòng — đúng các cột importRoomsCsv đọc, thêm
     subRooms và 3 dòng ví dụ. Giá/cọc tính bằng vnđ. Nhà KHÔNG có trong
     file: người dùng chọn 1 nhà ở bộ lọc trước khi import. */
  var rows = [['name','floor','area','type','toilet','kitchen','price','minDeposit','maxPeople','subRooms'],
    ['Phòng 301',3,30,'Phòng trọ','Khép kín','Trong phòng',3000000,3000000,3,0],
    ['Phòng 302',3,28,'Phòng trọ','Khép kín','Trong phòng',2800000,2800000,2,0],
    ['Phòng 303',3,32,'Studio','Khép kín','Trong phòng',3500000,3500000,3,0]];
  downloadText('mau-them-phong.csv', rows.map(function(r){ return r.map(csvCell).join(','); }).join('\n'));
}
function exportRoomsCsv(){
  var rows = [['Tên nhà','Tầng','Tên phòng','Cọc','Giá phòng','Diện tích','Loại phòng','Trạng thái','Chung chủ','Vệ sinh','Số phòng','Gác xép','Bếp','Số người tối đa','Dịch vụ']];
  filteredRooms().forEach(function(r){
    var sv = r.services || {};
    var svNames = Object.keys(sv).filter(function(k){ return k!=='extra' && sv[k] && (sv[k].price || sv[k].fee); }).map(function(k){
      return {dien:'Điện',dienChung:'Điện chung',internet:'Internet',nuoc:'Nước',vesinh:'Vệ sinh',xeMay:'Xe máy',oTo:'Ô tô',xeDap:'Xe đạp'}[k] || k; });
    (sv.extra || []).forEach(function(x){ if(x && x.name) svNames.push(x.name); });
    rows.push([houseName(r.houseId), r.floor, r.name, r.minDeposit, r.price, r.area, r.type,
      invStatusLabel2(roomStatus(r)), r.withOwner?'Có':'Không', r.toilet, r.subRooms || 0,
      (r.amenities||[]).indexOf('Gác xép')>=0?'Có':'Không', r.kitchen||'', r.maxPeople, svNames.join(', ')]);
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
        subRooms: num(rec.subRooms), payMonths: 1, payDay: 1, amenities: [], services: {} }));
    }
    Promise.all(jobs).then(function(){ toast('Đã thêm ' + jobs.length + ' phòng từ file'); viewRooms(); }).catch(errToast);
    input.value = '';
  });
}
function svPriceOf(v, dft){ return typeof v === 'number' ? v : (v && v.price !== undefined ? v.price : dft); }
function svUnitOf(v, dft){ return (v && typeof v === 'object' && v.unit) ? v.unit : dft; }
/* Đợt 27 — Form phòng: Giá phòng nhập trực tiếp theo VNĐ (không nhân triệu nữa) */
function trieuVal(vnd){ return Math.round(((Number(vnd) || 0) / 1000000) * 100) / 100; }
function numTrieu(v){
  var p = splitMoneyParts(v, true);
  if(!p) return 0;
  var x = parseFloat((p.int || '0') + (p.dec ? '.' + p.dec : ''));
  return isNaN(x) ? 0 : Math.round(x * 1000000);
}
/* 7 loại phòng của ảnh thiết kế form phòng (2 giá trị 'Khép kín'/'Không khép kín'
   trong ROOM_TYPES là kiểu vệ sinh, không phải loại phòng) */
var ROOM_TYPES_FORM = ['Chung cư mini','Homestay','Phòng trọ','Phòng đơn','Studio','1 ngủ 1 khách','2 ngủ 1 khách'];
/* Dịch vụ cố định của phòng: [key, tên hiển thị, có đơn vị tính hay không] */
var ROOM_FIXED_SV = [['dien','Điện',true],['nuoc','Nước',true],['dienChung','Điện chung',false],['vesinh','Vệ sinh',false],['internet','Internet',false]];
var SV_UNITS = [['so','số'],['nguoi','người'],['phong','phòng'],['xe','xe']];
function svUnitLabel(u){ var m = { so:'số', nguoi:'người', phong:'phòng', xe:'xe' }; return m[u] || u || ''; }
function roomSvState(sv, showDefaults){
  sv = sv || {};
  var rows = [];
  ROOM_FIXED_SV.forEach(function(f){
    /* Sửa phòng: chỉ hiện dịch vụ cố định mà phòng đã lưu (dịch vụ đã xóa
       trước đó không tự hiện lại với giá mặc định). Thêm phòng mới:
       showDefaults=true nên vẫn hiện đủ 5 dịch vụ mặc định như trước. */
    if(!showDefaults && sv[f[0]] === undefined) return;
    rows.push({ key: f[0], name: f[1], hasUnit: f[2],
      price: svPriceOf(sv[f[0]], f[0]==='dien' ? 3000 : (f[0]==='nuoc' ? 20000 : (f[0]==='dienChung' ? 30000 : (f[0]==='vesinh' ? 20000 : 50000)))),
      unit: f[2] ? svUnitOf(sv[f[0]], f[0]==='dien' ? 'so' : 'nguoi') : 'nguoi', editing: false });
  });
  (sv.extra || []).forEach(function(x){ if(x && x.name) rows.push({ key:'', name: x.name, hasUnit:true, price: x.price || 0, unit: x.unit || 'phong', editing:false }); });
  return rows;
}
function renderRoomSvRows(){
  var wrap = document.getElementById('r_sv_list'); if(!wrap) return;
  wrap.innerHTML = window._rsvRows.map(function(rw, i){
    if(rw.editing){
      return '<div class="fgrid" style="align-items:end"><div>'+fld('Tên dịch vụ', inp('rsv_name_'+i, rw.name))+'</div>' +
        '<div>'+fld('Giá (vnđ)', inp('rsv_price_'+i, rw.price, 'money'))+'</div>' +
        '<div>'+fld('Đơn vị', sel('rsv_unit_'+i, SV_UNITS, rw.unit))+'</div>' +
        '<div><label class="fl">&nbsp;</label><button type="button" class="btn sm green" onclick="doneRoomSvRow('+i+')">Xong</button></div></div>';
    }
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed #eceff1">' +
      '<span style="flex:1"><b>'+esc(rw.name)+'</b> — '+fmtNum(rw.price)+' vnđ/'+esc(svUnitLabel(rw.unit))+'</span>' +
      '<button type="button" class="btn sm" onclick="editRoomSvRow('+i+')">Sửa</button>' +
      /* Mọi dịch vụ đều xóa được (kể cả dịch vụ cố định): Xóa ở đây chỉ gỡ
         dòng khỏi form trước khi lưu, chưa chạm tới danh mục Dịch vụ chung. */
      '<button type="button" class="btn sm red" onclick="delRoomSvRow('+i+')">Xóa</button></div>';
  }).join('');
}
function editRoomSvRow(i){ window._rsvRows[i].editing = true; renderRoomSvRows(); }
function delRoomSvRow(i){ window._rsvRows.splice(i, 1); renderRoomSvRows(); }
function doneRoomSvRow(i){
  var rw = window._rsvRows[i];
  rw.name = val('rsv_name_'+i) || rw.name;
  rw.price = num(val('rsv_price_'+i));
  rw.unit = val('rsv_unit_'+i) || rw.unit;
  rw.editing = false;
  renderRoomSvRows();
}
function addRoomSvFromCatalog(){
  var name = val('r_sv_new_name');
  if(!name){ toast('Chọn dịch vụ từ danh mục'); return; }
  var price = num(val('r_sv_new_price')), unit = val('r_sv_new_unit') || 'phong';
  var keyMap = { 'Điện':'dien', 'Nước':'nuoc', 'Điện chung':'dienChung', 'Vệ sinh':'vesinh', 'Internet':'internet', 'Mạng internet':'internet' };
  var key = keyMap[name] || '';
  if(key){
    for(var i=0;i<window._rsvRows.length;i++) if(window._rsvRows[i].key === key){ window._rsvRows[i].price = price; window._rsvRows[i].unit = unit; renderRoomSvRows(); return; }
  }
  window._rsvRows.push({ key: key, name: name, hasUnit: true, price: price, unit: unit, editing: false });
  renderRoomSvRows();
}
/* ----- Đợt 16: Ảnh phòng (nhiều ảnh, tải lên thật như ảnh sổ đỏ của nhà) ----- */
function rmRender(){
  var grid = document.getElementById('rm_grid'); if(!grid) return;
  var list = window._rmImages || [];
  grid.innerHTML = list.length ? list.map(function(u, i){
    return '<div class="rb-cell"><a href="'+esc(u)+'" target="_blank" rel="noopener"><img class="rb-thumb" src="'+esc(u)+'" alt="Ảnh phòng"></a>' +
      '<button type="button" class="rb-x" title="Xóa ảnh này" onclick="rmRemove('+i+')">✕</button></div>';
  }).join('') : '<div class="img-ph" style="padding:10px 6px;flex:1">🖼️<br>Chưa có ảnh phòng</div>';
}
function rmPickFiles(){
  var input = document.getElementById('rm_file');
  var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
  if(input) input.value = '';
  if(!files.length) return;
  window._rmImages = window._rmImages || [];
  toast('Đang tải ' + files.length + ' ảnh phòng lên...');
  var chain = Promise.resolve();
  files.forEach(function(f){
    chain = chain.then(function(){ return uploadImageFile(f); }).then(function(url){
      window._rmImages.push(url); rmRender();
    });
  });
  chain.then(function(){ toast('Đã tải ảnh phòng lên'); }).catch(function(e){ errToast(e); rmRender(); });
}
function rmRemove(i){ (window._rmImages || []).splice(i, 1); rmRender(); }
/* ----- Đợt 16: Tài sản trong phòng — cùng mẫu với Tài sản của nhà ----- */
function addRoomAssetRow(type, status, note, assetId, imageUrl){
  var i = window._raCount = (window._raCount || 0) + 1;
  var wrap = document.getElementById('ra_rows'); if(!wrap) return;
  var types = HOUSE_ASSET_TYPES.slice();
  if(type && types.indexOf(type) < 0) types.unshift(type);
  var existed = assetId ? byId(db.assets, assetId) : null;
  var div = document.createElement('div');
  div.className = 'fgrid'; div.id = 'ra_row_' + i;
  if(assetId) div.setAttribute('data-aid', assetId);
  div.innerHTML = (existed ? '<div><label class="fl">Mã tài sản</label><div style="padding:9px 2px;font-weight:600">'+esc(existed.code || '')+'</div></div>' : '') +
    '<div>'+fld('Loại tài sản', sel('ra_type_'+i, types, type||'Tivi'))+'</div>' +
    '<div>'+fld('Trạng thái', sel('ra_status_'+i, ASSET_STATUSES, status||'Tốt'))+'</div>' +
    imagePickerHtml('ra_img_'+i, imageUrl || (existed ? (existed.imageUrl || '') : ''), 'Ảnh tài sản') +
    '<div>'+fld('Note', inp('ra_note_'+i, note||''))+'</div>' +
    '<div><label class="fl">&nbsp;</label><button type="button" class="btn sm red" onclick="raRemoveRow('+i+')">Xóa dòng</button></div>';
  wrap.appendChild(div);
}
function raRemoveRow(i){
  var row = document.getElementById('ra_row_' + i); if(!row) return;
  var aid = row.getAttribute('data-aid');
  /* Tài sản đã lưu: ghi nhớ để xóa thật khi bấm Lưu phòng. Dòng mới thêm
     trong form thì chỉ cần gỡ khỏi form. */
  if(aid){ window._raRemoved = window._raRemoved || []; if(window._raRemoved.indexOf(aid) < 0) window._raRemoved.push(aid); }
  row.remove();
}
function viewRoomForm(p){
  var r = p.id ? byId(db.rooms, p.id) : null;
  var sv = r ? (r.services || {}) : {};
  var typeOpts = ROOM_TYPES_FORM.slice();
  if(r && r.type && typeOpts.indexOf(r.type) < 0) typeOpts.unshift(r.type);
  var catalogNames = db.services.map(function(s){ return s.name; });
  ROOM_FIXED_SV.forEach(function(f){ if(catalogNames.indexOf(f[1]) < 0) catalogNames.push(f[1]); });
  var h = pageTitle(r ? 'Sửa phòng' : 'Thêm phòng');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveRoom(\''+(r?r.id:'')+'\')"><div class="fgrid">' +
    fld('Nhà', selObj('r_house', db.houses, r?r.houseId:(roomFilter.houseId||''), function(x){ return (x.name||x.address); }), true) +
    fld('Tên phòng', inp('r_name', r?r.name:''), true) +
    fld('Tầng', inp('r_floor', r?r.floor:1, 'number')) +
    fld('Diện tích (m2)', inp('r_area', r?r.area:0, 'number')) +
    fld('Loại phòng', sel('r_type', typeOpts, r?r.type:'Phòng trọ')) +
    fld('Chung chủ', chk('r_withOwner', 'Có', !!(r && r.withOwner))) +
    fld('Vệ sinh', sel('r_toilet', ['Khép kín','Riêng','Chung'], r?r.toilet:'Khép kín')) +
    fld('Số phòng', inp('r_subrooms', r?r.subRooms:0, 'number')) +
    fld('Số người tối đa (người)', inp('r_max', r?r.maxPeople:0, 'number')) +
    fld('Giá phòng (vnđ)', inp('r_price', r ? r.price : '', 'money', 'placeholder="VD: 5.700.000"'), true) +
    fld('Cọc tối thiểu (vnđ)', inp('r_minDep', r?r.minDeposit:0, 'money')) +
    fld('Số tháng thanh toán 1 lần', inp('r_payMonths', r?r.payMonths:1, 'number')) +
    fld('Thời gian đóng tiền', inp('r_payday', r ? (r.payDay || r.payFromDay || 1) : 1, 'number')) +
    '</div>' +
    '<h3 class="sec">Dịch Vụ</h3><div id="r_sv_list"></div>' +
    '<div class="fgrid" style="margin-top:10px;align-items:end">' +
    '<div>'+fld('Thêm dịch vụ — chọn từ danh mục', sel('r_sv_new_name', [['','-- Chọn dịch vụ --']].concat(catalogNames.map(function(n){ return [n,n]; })), ''))+'</div>' +
    '<div>'+fld('Giá (vnđ)', inp('r_sv_new_price', 0, 'money'))+'</div>' +
    '<div>'+fld('Đơn vị', sel('r_sv_new_unit', SV_UNITS, 'phong'))+'</div>' +
    '<div><label class="fl">&nbsp;</label><button type="button" class="btn sm green" onclick="addRoomSvFromCatalog()">Thêm dịch vụ</button></div></div>' +
    '<h3 class="sec">Tiện ích</h3><div>' + AMENITIES.map(function(a){
      return chk('r_am_'+a, a, r && (r.amenities||[]).indexOf(a)>=0);
    }).join('') + '</div>' +
    '<div class="fgrid"><div>' + fld('Bếp', sel('r_kitchen', ['Không có','Trong phòng','Bên ngoài','Chung'], r?r.kitchen:'Không có')) + '</div></div>';
  /* Đợt 16: Ảnh phòng + Tài sản trong phòng (cùng mẫu với form nhà) */
  h += '<div class="form-sec"><h3 class="sec">Ảnh phòng</h3>' +
    '<div id="rm_grid" class="rb-grid"></div>' +
    '<input type="file" id="rm_file" accept="image/png,image/jpeg,image/gif,image/webp" multiple style="display:none" onchange="rmPickFiles()">' +
    '<div class="btnrow" style="margin:6px 0 0"><button type="button" class="btn sm gray" onclick="document.getElementById(\'rm_file\').click()">📷 Thêm ảnh phòng</button></div></div>' +
    '<div class="form-sec"><h3 class="sec">Tài sản trong phòng</h3><div id="ra_rows"></div>' +
    '<div class="btnrow"><button type="button" class="btn sm" onclick="addRoomAssetRow()">+ Thêm tài sản</button></div></div>';
  h += '<div class="btnrow"><button class="btn green" type="submit">'+(r ? 'Lưu thay đổi' : 'Thêm phòng')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'rooms\')">Quay lại</button></div></form>';
  setContent(h);
  window._rsvRows = roomSvState(sv, !r);
  renderRoomSvRows();
  window._raCount = 0; window._raRemoved = [];
  window._rmImages = (r && Array.isArray(r.images)) ? r.images.slice() : [];
  rmRender();
  (r ? db.assets.filter(function(a){ return a.roomId === r.id; }) : []).forEach(function(a){
    addRoomAssetRow(a.type, a.status, a.note || '', a.id, a.imageUrl || '');
  });
}
function saveRoom(id){
  if(!lockSave('room')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  /* Đợt 27: giá phòng nhập trực tiếp bằng vnđ (không còn ô triệu) nên
     không còn cảnh báo nhầm đơn vị triệu ở đây; số vượt int32 thì
     backend chặn bằng 400 (xem backend/intrange.py). */
  var old = id ? byId(db.rooms, id) : null;
  var amenities = AMENITIES.filter(function(a){ return isChk('r_am_'+a); });
  // Giữ lại tiện ích ngoài danh sách 14 của thiết kế (vd 'Tivi' từ dữ liệu cũ)
  if(old) (old.amenities || []).forEach(function(a){ if(AMENITIES.indexOf(a) < 0 && amenities.indexOf(a) < 0) amenities.push(a); });
  // Thu thập dịch vụ từ danh sách dòng (dòng đang sửa dở thì đọc luôn ô nhập)
  var services = { extra: [] };
  (window._rsvRows || []).forEach(function(rw, i){
    var price = rw.editing ? num(val('rsv_price_'+i)) : rw.price;
    var unit = rw.editing ? (val('rsv_unit_'+i) || rw.unit) : rw.unit;
    var name = rw.editing ? (val('rsv_name_'+i) || rw.name) : rw.name;
    if(rw.key === 'dien' || rw.key === 'nuoc') services[rw.key] = { price: price, unit: unit };
    else if(rw.key) services[rw.key] = { price: price };
    else services.extra.push({ name: name, price: price, unit: unit });
  });
  var data = { houseId: val('r_house'), name: val('r_name'), floor: num(val('r_floor')),
    area: num(val('r_area')), type: val('r_type'), toilet: val('r_toilet'), kitchen: val('r_kitchen'),
    withOwner: isChk('r_withOwner'), price: num(val('r_price')), minDeposit: num(val('r_minDep')),
    maxPeople: num(val('r_max')), subRooms: num(val('r_subrooms')), payMonths: num(val('r_payMonths'))||1,
    payDay: Math.min(31, Math.max(1, num(val('r_payday'))||1)), amenities: amenities,
    services: services,
    /* Đợt 16: danh sách URL ảnh phòng đã tải lên */
    images: (window._rmImages || []).slice() };
  /* Đọc các dòng tài sản trong form: dòng có data-aid là tài sản sẵn có
     (cập nhật), dòng không có là tài sản thêm mới (tạo mới). */
  var assetRows = [];
  document.querySelectorAll('#ra_rows > div').forEach(function(row){
    var m = (row.id || '').match(/^ra_row_(\d+)$/); if(!m) return;
    var i = m[1], tEl = document.getElementById('ra_type_' + i);
    if(tEl && tEl.value.trim())
      assetRows.push({ aid: row.getAttribute('data-aid') || '', type: tEl.value.trim(),
        status: val('ra_status_' + i) || 'Tốt', note: val('ra_note_' + i),
        imageUrl: val('ra_img_' + i) });
  });
  var pr = id ? updateRec('rooms', id, data) : createRec('rooms', data);
  pr.then(function(savedRoom){
    var roomId = (savedRoom && savedRoom.id) || id;
    var jobs = [];
    assetRows.forEach(function(rr){
      if(rr.aid) jobs.push(updateRec('assets', rr.aid, { type: rr.type, status: rr.status, note: rr.note, imageUrl: rr.imageUrl }));
      else jobs.push(createRec('assets', { houseId: data.houseId, roomId: roomId, owner: 'room',
        type: rr.type, status: rr.status, note: rr.note, imageUrl: rr.imageUrl }));
    });
    (window._raRemoved || []).forEach(function(aid){ jobs.push(deleteRecDirect('assets', aid)); });
    return Promise.all(jobs);
  }).then(function(){ toast('Đã lưu phòng'); go('rooms'); unlockSave('room'); }).catch(function(e){ errToast(e); unlockSave('room'); });
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
    '<div class="kv"><span>Thời gian đóng tiền</span><span>Ngày '+(r.payDay || r.payFromDay || 1)+'</span></div>' +
    '<div class="kv"><span>Tầng / Diện tích / Loại</span><span>'+r.floor+' / '+r.area+' m2 / '+esc(r.type)+'</span></div>' +
    '<div class="kv"><span>Số phòng (phòng con) / Số người tối đa</span><span>'+(r.subRooms||0)+' / '+(r.maxPeople||0)+'</span></div>' +
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
  /* Đợt 16: ảnh phòng + ảnh từng tài sản ở chi tiết phòng */
  if(r.images && r.images.length)
    h += '<h3 class="sec">Ảnh phòng</h3><div class="rb-grid">' + r.images.map(function(u){
      return '<div class="rb-cell"><a href="'+esc(u)+'" target="_blank" rel="noopener"><img class="rb-thumb" src="'+esc(u)+'" alt="Ảnh phòng"></a></div>';
    }).join('') + '</div>';
  h += '<h3 class="sec">Tài sản của phòng</h3>' + tableHtml(['Mã TS','Loại','Trạng thái','Ảnh'], assets.map(function(a){
    return '<tr><td>'+esc(a.code)+'</td><td>'+esc(a.type)+'</td><td>'+esc(a.status)+'</td>' +
      '<td>'+(a.imageUrl ? '<a href="'+esc(a.imageUrl)+'" target="_blank" rel="noopener"><img class="asset-thumb-sm" src="'+esc(a.imageUrl)+'" alt="Ảnh tài sản"></a>' : '')+'</td></tr>'; }).join(''), 'Chưa có tài sản');
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
  /* Đợt 30: tiền hiển thị theo VNĐ, cột Sửa/Xóa tách riêng */
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Tên phòng','Giá phòng (vnđ)','Giá thuê (vnđ)','Tiền giữ phòng (vnđ)','Thời gian trống phòng (ngày)','Ngày vào','Ngày ra','Ngày cọc','Ngày đến làm hợp đồng','Ngày hết hạn cọc','Sửa','Xóa'], list.map(function(d, i){
    var room = byId(db.rooms, d.roomId);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(d.code||'')+'</td><td>'+esc(houseName(d.houseId))+'</td><td>'+esc(roomName(d.roomId))+'</td>' +
      '<td>'+fmt(room ? room.price : 0)+'</td><td>'+fmt(d.rentPrice)+'</td><td class="price">'+fmt(d.amount)+'</td><td>'+(d.vacantDays||0)+'</td>' +
      '<td>'+fmtDate(d.moveInDate)+'</td><td>'+fmtDate(d.moveOutDate)+'</td><td>'+fmtDate(d.date)+'</td><td>'+fmtDate(d.contractDate)+'</td><td>'+fmtDate(d.expiryDate)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'depositForm\',{id:\''+d.id+'\'})">Sửa</button></td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Cọc phòng '+esc(roomName(d.roomId))+'\',\'deposits\',\''+d.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có đặt cọc nào');
  setContent(h);
}
function depRoomOptions(houseId, selectedId){
  return db.rooms.filter(function(x){ return !houseId || x.houseId === houseId; }).map(function(x){
    return '<option value="'+x.id+'"'+(selectedId === x.id ? ' selected' : '')+'>'+esc(x.name + ' (' + houseName(x.houseId) + ')')+'</option>';
  }).join('');
}
function depHouseChange(){
  var sel = document.getElementById('dp_room'); if(!sel) return;
  sel.innerHTML = depRoomOptions(val('dp_house'), '');
  depFillFromRoom(true);
}
/* Đợt mới: phần Dịch vụ của form cọc nạp tự động từ phòng đang chọn —
   giá + cách tính điện/nước và phí xe đều theo phòng; số lượng xe là
   thông tin của khách thuê nên giữ nguyên khi đổi phòng, không nạp lại. */
function depFillFromRoom(force){
  var room = byId(db.rooms, val('dp_room')); if(!room) return;
  var sv = room.services || {};
  function set(id, v){ var e = document.getElementById(id); if(e && (force || e.value === '' || e.value === '0')){ e.value = v; if(e.classList.contains('money')) moneyFmt(e); } }
  /* Select đơn vị: gán .value trực tiếp (không qua moneyFmt); nếu phòng
     lưu đơn vị không có trong select thì về mặc định. */
  function setSel(id, v, dft){ var e = document.getElementById(id); if(!e || !(force || !e.value)) return;
    var has = false; for(var i = 0; i < e.options.length; i++) if(e.options[i].value === v) has = true;
    e.value = has ? v : dft; }
  /* Phí xe của phòng: ưu tiên fee (dạng {count, fee}), rồi price/số trần
     (dạng {price} hoặc số), cuối cùng là mặc định. */
  function svFee(k, dft){ var row = sv[k]; if(!row) return dft;
    if(typeof row === 'object' && row.fee !== undefined) return row.fee;
    return svPriceOf(row, dft); }
  set('dp_rent', room.price || 0);
  set('dp_price', room.price || 0);
  set('dp_mindep', room.minDeposit || 0);
  set('dp_max', room.maxPeople || 0);
  set('dp_paymonths', room.payMonths || 1);
  set('dp_from', room.payDay || room.payFromDay || 1);
  set('dp_to', room.payDay || room.payToDay || 3);
  set('dp_sv_dien', svPriceOf(sv.dien, 3000));
  setSel('dp_sv_dien_unit', svUnitOf(sv.dien, 'so'), 'so');
  set('dp_sv_nuoc', svPriceOf(sv.nuoc, 80000));
  setSel('dp_sv_nuoc_unit', svUnitOf(sv.nuoc, 'nguoi'), 'nguoi');
  set('dp_xm_f', svFee('xeMay', 30000));
  set('dp_ot_f', svFee('oTo', 100000));
  set('dp_xd_f', svFee('xeDap', 10000));
  /* Số lượng xe (dp_xm_n/dp_ot_n/dp_xd_n) cố tình không chạm tới: đó là
     thông tin của khách thuê, phòng không có số này. */
  var hs = document.getElementById('dp_house'); if(hs) hs.value = room.houseId;
  var tt = document.getElementById('dp_room_title'); if(tt) tt.textContent = 'Phòng ' + room.name;
}
function viewDepositForm(p){
  var d = p.id ? byId(db.deposits, p.id) : null;
  var room = d ? byId(db.rooms, d.roomId) : (db.rooms[0] || null);
  var cust = d && d.customerId ? byId(db.customers, d.customerId) : null;
  var sc = (d && d.serviceConfig) || {};
  var rsv = room ? (room.services || {}) : {};
  function scv(k, sub, dft){ var s = sc[k] || rsv[k]; if(s === undefined || s === null) return dft; return (typeof s === 'object') ? (s[sub] !== undefined ? s[sub] : dft) : (sub === 'price' ? s : dft); }
  var h = pageTitle(d ? 'Sửa cọc phòng' : 'Thêm cọc phòng — Cọc giữ phòng');
  /* Đợt 5: form cọc là 1 TRANG CUỘN (không còn 2 tab) */
  h += '<form class="form-card" onsubmit="event.preventDefault();saveDeposit(\''+(d?d.id:'')+'\')">' +
    '<div class="fgrid">' +
    fld('Nhà', '<select id="dp_house" onchange="depHouseChange()">' + db.houses.map(function(x){
      return '<option value="'+x.id+'"'+(room && room.houseId===x.id ? ' selected' : '')+'>'+esc(x.name || x.address)+'</option>'; }).join('') + '</select>', true) +
    fld('Phòng', '<select id="dp_room" onchange="depFillFromRoom(true)">' + depRoomOptions(room ? room.houseId : '', room ? room.id : '') + '</select>', true) +
    '</div>' +
    '<h3 class="sec" id="dp_room_title">Phòng ' + esc(room ? room.name : '') + '</h3>' +
    /* --- Thông tin khách --- */
    '<div class="form-sec"><h3 class="sec">Thông tin khách</h3>' +
    fld('Chọn khách có sẵn (chọn là tự điền hồ sơ, sửa được; để trống = nhập khách mới)', '<select id="dp_custSel" onchange="custPickInto(\'dc\',\'dp_custSel\')">' +
      '<option value="">-- Nhập khách mới --</option>' + db.customers.map(function(x){
        return '<option value="'+x.id+'"'+(cust && cust.id===x.id ? ' selected' : '')+'>'+esc(x.name + ' — ' + (x.phone||''))+'</option>'; }).join('') + '</select>') +
    custFieldsHtml('dc', cust || (d ? { name: d.customerName, phone: d.phone } : {})) +
    '<div class="fgrid">' + cmndPhotosHtml() + '</div></div>' +
    /* --- Thông tin cọc giữ phòng --- */
    '<div class="form-sec"><h3 class="sec">Thông tin cọc giữ phòng</h3><div class="fgrid">' +
    fld('Mã HĐ cọc (để trống = tự sinh)', inp('dp_code', d?d.code:'')) +
    fld('Số tiền cọc giữ phòng (vnđ)', inp('dp_amount', d?d.amount:0, 'money'), true) +
    fld('Thời gian trống phòng (ngày)', inp('dp_vacant', d?d.vacantDays:0, 'number')) +
    fld('Thời gian thuê từ ngày (ngày vào)', inp('dp_in', d?d.moveInDate:'', 'date'), true) +
    fld('đến ngày (ngày ra)', inp('dp_out', d?d.moveOutDate:'', 'date'), true) +
    fld('Ngày cọc', inp('dp_date', d?d.date:today(), 'date'), true) +
    fld('Ngày đến làm hợp đồng', inp('dp_contract', d?d.contractDate:'', 'date'), true) +
    fld('Ngày hết hạn cọc', inp('dp_expiry', d?d.expiryDate:'', 'date'), true) +
    '</div>' + fld('Ghi chú', '<textarea id="dp_note">'+esc(d?d.note:'')+'</textarea>') + '</div>' +
    /* --- Thông tin phòng: tự điền từ phòng, cho sửa --- */
    '<div class="form-sec"><h3 class="sec">Thông tin phòng</h3><div class="fgrid">' +
    fld('Giá phòng (vnđ)', inp('dp_price', d ? (room?room.price:0) : (room?room.price:0), 'money')) +
    fld('Giá thuê (vnđ)', inp('dp_rent', d?d.rentPrice:(room?room.price:0), 'money')) +
    fld('Cọc (vnđ)', inp('dp_mindep', room?room.minDeposit:0, 'money')) +
    fld('Số người ở tối đa', inp('dp_max', room?room.maxPeople:0, 'number')) +
    fld('Số tháng thanh toán 1 lần', inp('dp_paymonths', d?d.payMonths:1, 'number')) +
    fld('Thời gian thanh toán từ ngày', inp('dp_from', d?d.payDayFrom:1, 'number')) +
    fld('đến ngày', inp('dp_to', d?d.payDayTo:3, 'number')) +
    '</div></div>' +
    /* --- Dịch Vụ --- */
    '<div class="form-sec"><h3 class="sec">Dịch Vụ</h3><div class="fgrid">' +
    fld('Giá điện (vnđ)', inp('dp_sv_dien', scv('dien','price',3000), 'money')) +
    fld('Cách tính điện', sel('dp_sv_dien_unit', [['so','số'],['nguoi','người'],['phong','phòng']], scv('dien','unit','so'))) +
    fld('Giá nước (vnđ)', inp('dp_sv_nuoc', scv('nuoc','price',80000), 'money')) +
    fld('Cách tính nước', sel('dp_sv_nuoc_unit', [['nguoi','người'],['so','số'],['phong','phòng']], scv('nuoc','unit','nguoi'))) +
    fld('Xe máy — số lượng', inp('dp_xm_n', scv('xeMay','count',0), 'number')) +
    fld('Xe máy — phí 1 xe (vnđ)', inp('dp_xm_f', scv('xeMay','fee',30000), 'money')) +
    fld('Ô tô — số lượng', inp('dp_ot_n', scv('oTo','count',0), 'number')) +
    fld('Ô tô — phí 1 xe (vnđ)', inp('dp_ot_f', scv('oTo','fee',100000), 'money')) +
    fld('Xe đạp — số lượng', inp('dp_xd_n', scv('xeDap','count',0), 'number')) +
    fld('Xe đạp — phí 1 xe (vnđ)', inp('dp_xd_f', scv('xeDap','fee',10000), 'money')) +
    '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">'+(d ? 'Lưu thay đổi' : 'Cọc giữ phòng')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'deposits\')">Quay lại</button></div></form>';
  setContent(h);
  if(!d) depFillFromRoom(true);
}
function saveDeposit(id){
  var room = byId(db.rooms, val('dp_room'));
  var custSel = val('dp_custSel');
  var finish = function(customer){
    var data = { houseId: room ? room.houseId : val('dp_house'), roomId: val('dp_room'), code: val('dp_code'),
      customerId: customer ? customer.id : null,
      customerName: customer ? customer.name : val('dc_name'), phone: customer ? customer.phone : val('dc_phone'),
      amount: num(val('dp_amount')), rentPrice: num(val('dp_rent')), vacantDays: num(val('dp_vacant')),
      payMonths: num(val('dp_paymonths')) || 1, payDayFrom: num(val('dp_from')) || 1, payDayTo: num(val('dp_to')) || 3,
      serviceConfig: { dien: { price: num(val('dp_sv_dien')), unit: val('dp_sv_dien_unit') },
        nuoc: { price: num(val('dp_sv_nuoc')), unit: val('dp_sv_nuoc_unit') },
        xeMay: { count: num(val('dp_xm_n')), fee: num(val('dp_xm_f')) },
        oTo: { count: num(val('dp_ot_n')), fee: num(val('dp_ot_f')) },
        xeDap: { count: num(val('dp_xd_n')), fee: num(val('dp_xd_f')) } },
      date: val('dp_date') || null, moveInDate: val('dp_in') || null, moveOutDate: val('dp_out') || null,
      contractDate: val('dp_contract') || null, expiryDate: val('dp_expiry') || null, note: val('dp_note') };
    var pr = id ? updateRec('deposits', id, data) : createRec('deposits', data);
    pr.then(function(){ toast('Đã lưu cọc giữ phòng'); go('deposits'); }).catch(errToast);
  };
  /* Khách có sẵn: cập nhật hồ sơ theo các ô đã sửa; khách mới: tạo mới */
  if(custSel){ updateRec('customers', custSel, collectCust('dc')).then(finish).catch(errToast); return; }
  createRec('customers', collectCust('dc')).then(finish).catch(errToast);
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
  /* Đợt 5: màn DS hợp đồng thuê phòng — lọc CHỈ 2 select Nhà trọ / Phòng trọ
     (đã bỏ các tab trạng thái HĐ khỏi màn này theo ảnh thiết kế) */
  var roomOpts = db.rooms.filter(function(r){ return !st.houseId || r.houseId === st.houseId; });
  h += '<div class="filters"><div class="fg"><label>Nhà trọ</label>'+selObj('cf_house', db.houses, st.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('cf_room', roomOpts, st.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<button class="btn" onclick="contractState.houseId=val(\'cf_house\');contractState.roomId=val(\'cf_room\');viewContracts()">Lọc</button></div>' +
    '<div class="btnrow" style="justify-content:flex-end"><button class="btn green" onclick="go(\'contractForm\')">+ Thêm Hợp Đồng</button></div>';
  var list = db.contracts.filter(function(c){
    if(st.houseId && c.houseId !== st.houseId) return false;
    if(st.roomId && c.roomId !== st.roomId) return false;
    return true;
  });
  function latestDeposit(roomId){
    var ds = db.deposits.filter(function(x){ return x.roomId === roomId; });
    return ds.length ? ds[ds.length - 1] : null;
  }
  var roomStatusBadge = function(r){
    if(!r) return '';
    var s = roomStatus(r);
    return s==='rented' ? '<span class="badge b-rented">Đang thuê</span>' : (s==='deposited' ? '<span class="badge b-deposited">Đang cọc</span>' : '<span class="badge b-empty">Trống</span>');
  };
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Tên phòng','Giá phòng (vnđ)','Giá thuê (vnđ)','Tiền cọc (vnđ)','Trạng thái','Thời gian trống phòng (ngày)','Ngày vào','Ngày ra','Số người ở','Sửa','Thanh lý'], list.map(function(c, i){
    var room = byId(db.rooms, c.roomId);
    var dep = latestDeposit(c.roomId);
    return '<tr><td>'+(i+1)+'</td><td><a onclick="go(\'contractDetail\',{id:\''+c.id+'\'})">'+esc(c.code||'')+'</a></td><td>'+esc(houseName(c.houseId))+'</td><td>'+esc(roomName(c.roomId))+'</td>' +
      '<td>'+fmt(room ? room.price : 0)+'</td><td class="price">'+fmt(c.price)+'</td><td>'+fmt(c.deposit)+'</td>' +
      '<td>'+roomStatusBadge(room)+'</td><td>'+(dep ? (dep.vacantDays||0) : '')+'</td>' +
      '<td>'+fmtDate(c.startDate)+'</td><td>'+fmtDate(c.endDate)+'</td><td>'+c.people+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'contractForm\',{id:\''+c.id+'\'})">Sửa</button></td>' +
      '<td class="act">'+(c.status==='active' ? '<button class="linkbtn" onclick="go(\'liquidate\',{id:\''+c.id+'\'})">Thanh lý</button>' : '<span class="badge b-gray">Đã thanh lý</span>')+'</td></tr>';
  }).join(''), 'Chưa có hợp đồng nào');
  setContent(h);
}
function contractCustPick(manual){
  /* Đợt 29: chọn tay thì khách không còn là "từ cọc" nữa — đổi phòng sau đó
     không được xóa lựa chọn tay này (chỉ xóa khách tự điền từ cọc). */
  if(manual) window._ctCustFromDep = false;
  var c = byId(db.customers, val('c_custSel'));
  var map = { name:'cu_name', dob:'cu_dob', permanentAddress:'cu_perm', phone:'cu_phone', gender:'cu_gender',
    job:'cu_job', maritalStatus:'cu_marital', email:'cu_email', idCard:'cu_idcard', currentAddress:'cu_curr', note:'cu_note' };
  Object.keys(map).forEach(function(k){
    var e = document.getElementById(map[k]); if(e) e.value = c ? (c[k] || '') : '';
  });
}
function contractRoomOptions(houseId, selectedId){
  return db.rooms.filter(function(x){ return !houseId || x.houseId === houseId; }).map(function(x){
    return '<option value="'+x.id+'"'+(selectedId === x.id ? ' selected' : '')+'>'+esc(x.name + ' (' + houseName(x.houseId) + ')')+'</option>';
  }).join('');
}
function contractHouseChange(){
  var sel = document.getElementById('c_room'); if(!sel) return;
  sel.innerHTML = contractRoomOptions(val('c_house'), '');
  contractRoomChange();
}
/* Đợt 29: cọc mới nhất của phòng theo created_at (API trả created_at từ
   DepositOut). Thiếu created_at thì lấy bản ghi cuối theo thứ tự list
   (API sắp xếp theo created_at) — bằng nhau thì bản ghi sau thắng. */
function latestDepositOfRoom(roomId){
  var best = null;
  db.deposits.forEach(function(x){
    if(x.roomId !== roomId) return;
    if(!best){ best = x; return; }
    var a = String(x.created_at || ''), b = String(best.created_at || '');
    if(a >= b) best = x;
  });
  return best;
}
function contractRoomChange(){
  var room = byId(db.rooms, val('c_room')); if(!room) return;
  var sv = room.services || {};
  function set(id, v){ var e = document.getElementById(id); if(e){ e.value = v; if(e.classList.contains('money')) moneyFmt(e); } }
  /* 1. Nạp từ thông tin phòng (hành vi hiện tại; xe cộ mirror đúng fallback
     lúc render form mới để đổi phòng không kẹt giá trị phòng cũ). */
  set('c_price', room.price || 0);
  set('c_deposit', room.minDeposit || 0);
  set('c_people', room.maxPeople || 1);
  set('c_payMonths', room.payMonths || 1);
  set('c_from', room.payDay || room.payFromDay || 1);
  set('c_to', room.payDay || room.payToDay || 3);
  set('c_dien', svPriceOf(sv.dien, 3000)); set('c_dien_unit', svUnitOf(sv.dien, 'so'));
  set('c_nuoc', svPriceOf(sv.nuoc, 80000)); set('c_nuoc_unit', svUnitOf(sv.nuoc, 'nguoi'));
  set('c_dc', svPriceOf(sv.dienChung, 30000));
  set('c_vs', svPriceOf(sv.vesinh, 20000));
  set('c_net', svPriceOf(sv.internet, 50000));
  set('c_xm_n', (sv.xeMay||{}).count !== undefined ? sv.xeMay.count : 1);
  set('c_xm_f', (sv.xeMay||{}).fee !== undefined ? sv.xeMay.fee : 30000);
  set('c_ot_n', (sv.oTo||{}).count || 0);
  set('c_ot_f', (sv.oTo||{}).fee !== undefined ? sv.oTo.fee : 100000);
  set('c_xd_n', (sv.xeDap||{}).count || 0);
  set('c_xd_f', (sv.xeDap||{}).fee !== undefined ? sv.xeDap.fee : 10000);
  /* 2. Đợt 29: chỉ khi TẠO hợp đồng mới và phòng đang được cọc (có cọc mà
     chưa có HĐ đang hoạt động) thì nạp đè từ cọc mới nhất thay vì từ phòng.
     Sửa hợp đồng có sẵn thì không đụng tới cọc. */
  var dep = null;
  if(window._ctIsNew){
    dep = latestDepositOfRoom(room.id);
    if(dep && activeContract(room.id)) dep = null;
  }
  var note = document.getElementById('c_fill_note');
  if(dep){
    var sc = dep.serviceConfig || {};
    if(dep.rentPrice) set('c_price', dep.rentPrice);
    if(dep.amount) set('c_deposit', dep.amount);
    if(dep.payMonths) set('c_payMonths', dep.payMonths);
    if(dep.payDayFrom) set('c_from', dep.payDayFrom);
    if(dep.payDayTo) set('c_to', dep.payDayTo);
    if(sc.dien){ set('c_dien', svPriceOf(sc.dien, 3000)); set('c_dien_unit', svUnitOf(sc.dien, 'so')); }
    if(sc.nuoc){ set('c_nuoc', svPriceOf(sc.nuoc, 80000)); set('c_nuoc_unit', svUnitOf(sc.nuoc, 'nguoi')); }
    if(sc.xeMay){ if(sc.xeMay.count !== undefined) set('c_xm_n', sc.xeMay.count); if(sc.xeMay.fee !== undefined) set('c_xm_f', sc.xeMay.fee); }
    if(sc.oTo){ if(sc.oTo.count !== undefined) set('c_ot_n', sc.oTo.count); if(sc.oTo.fee !== undefined) set('c_ot_f', sc.oTo.fee); }
    if(sc.xeDap){ if(sc.xeDap.count !== undefined) set('c_xd_n', sc.xeDap.count); if(sc.xeDap.fee !== undefined) set('c_xd_f', sc.xeDap.fee); }
    /* Ngày: cọc có ngày thì lấy, không có thì về mặc định hiện tại. */
    set('c_start', dep.moveInDate || today());
    set('c_end', dep.moveOutDate || addDays(today(), 365));
    set('c_sign', dep.contractDate || today());
    /* Khách: có customerId thì chọn khách đó rồi chạy đúng luồng
       contractCustPick(); không có thì điền thẳng tên/SĐT của cọc. */
    var csel = document.getElementById('c_custSel');
    if(dep.customerId && byId(db.customers, dep.customerId)){
      if(csel) csel.value = dep.customerId;
      contractCustPick();
    } else {
      if(csel) csel.value = '';
      contractCustPick();
      set('cu_name', dep.customerName || '');
      set('cu_phone', dep.phone || '');
    }
    window._ctCustFromDep = true;
    if(note) note.textContent = 'Phòng này đang được cọc — thông tin hợp đồng đã tự điền từ cọc giữ phòng (mới nhất). Có thể chỉnh lại trước khi lưu.';
  } else {
    /* Đợt 29: khách đang hiển thị mà là khách tự điền từ cọc của phòng trước
       thì xóa đi — tránh lưu nhầm khách của phòng khác vào hợp đồng này.
       Khách chọn tay thì giữ nguyên (hành vi hiện tại). */
    if(window._ctCustFromDep){
      var cs2 = document.getElementById('c_custSel');
      if(cs2) cs2.value = '';
      contractCustPick();
      window._ctCustFromDep = false;
    }
    if(note) note.textContent = 'Giá phòng, cọc, số người và dịch vụ tự điền từ thông tin phòng — có thể chỉnh lại trước khi lưu.';
  }
  var hs = document.getElementById('c_house'); if(hs) hs.value = room.houseId;
  var tt = document.getElementById('c_room_title'); if(tt) tt.textContent = 'Phòng ' + room.name;
}
function viewContractForm(p){
  var ct = p.id ? byId(db.contracts, p.id) : null;
  var room = ct ? byId(db.rooms, ct.roomId) : (p.roomId ? byId(db.rooms, p.roomId) : (db.rooms[0] || null));
  var cust = ct ? byId(db.customers, ct.customerId) : null;
  var sv = ct ? (ct.services || {}) : (room ? (room.services || {}) : {});
  function svNum(v, dft){ return typeof v === 'number' ? v : (v && v.price !== undefined ? v.price : dft); }
  function svUnit(v, dft){ return (v && typeof v === 'object' && v.unit) ? v.unit : dft; }
  var h = pageTitle(ct ? 'Sửa hợp đồng ' + (ct.code || '') : 'Thêm hợp đồng');
  /* Đợt 5: form hợp đồng 1 trang theo đúng thứ tự phần của ảnh thiết kế */
  h += '<form class="form-card" onsubmit="event.preventDefault();saveContract(\''+(ct?ct.id:'')+'\')">' +
    '<div class="fgrid">' +
    fld('Nhà', '<select id="c_house" onchange="contractHouseChange()">' + db.houses.map(function(x){
      return '<option value="'+x.id+'"'+(room && room.houseId===x.id ? ' selected' : '')+'>'+esc(x.name || x.address)+'</option>'; }).join('') + '</select>', true) +
    fld('Phòng', '<select id="c_room" onchange="contractRoomChange()">' + contractRoomOptions(room ? room.houseId : '', room ? room.id : '') + '</select>', true) +
    '</div>' +
    '<h3 class="sec" id="c_room_title">Phòng ' + esc(room ? room.name : '') + '</h3>' +
    '<p id="c_fill_note" style="color:#616161;margin-bottom:6px">Giá phòng, cọc, số người và dịch vụ tự điền từ thông tin phòng — có thể chỉnh lại trước khi lưu.</p>' +
    '<div class="fgrid">' +
    fld('Giá phòng (vnđ)', inp('c_price', ct?ct.price:(room?room.price:0), 'money'), true) +
    fld('Cọc (vnđ)', inp('c_deposit', ct?ct.deposit:(room?room.minDeposit:0), 'money')) +
    fld('Số người ở', inp('c_people', ct?ct.people:(room?room.maxPeople:1), 'number')) +
    '</div>' +
    '<div class="form-sec"><h3 class="sec">Dịch Vụ (cấu hình cho hợp đồng — hóa đơn tháng tính theo cấu hình này)</h3><div class="fgrid">' +
    fld('Giá điện (vnđ)', inp('c_dien', svNum(sv.dien, 3000), 'money')) +
    fld('Cách tính điện', sel('c_dien_unit', [['so','số'],['nguoi','người'],['phong','phòng']], svUnit(sv.dien, 'so'))) +
    fld('Giá nước (vnđ)', inp('c_nuoc', svNum(sv.nuoc, 80000), 'money')) +
    fld('Cách tính nước', sel('c_nuoc_unit', [['nguoi','người'],['so','số'],['phong','phòng']], svUnit(sv.nuoc, 'nguoi'))) +
    fld('Điện chung (vnđ/người)', inp('c_dc', svNum(sv.dienChung, 30000), 'money')) +
    fld('Vệ sinh (vnđ/người)', inp('c_vs', svNum(sv.vesinh, 20000), 'money')) +
    fld('Internet (vnđ/người)', inp('c_net', svNum(sv.internet, 50000), 'money')) +
    fld('Xe máy — số lượng', inp('c_xm_n', (sv.xeMay||{}).count !== undefined ? sv.xeMay.count : 1, 'number')) + fld('Xe máy — phí 1 xe', inp('c_xm_f', (sv.xeMay||{}).fee !== undefined ? sv.xeMay.fee : 30000, 'money')) +
    fld('Ô tô — số lượng', inp('c_ot_n', (sv.oTo||{}).count || 0, 'number')) + fld('Ô tô — phí 1 xe', inp('c_ot_f', (sv.oTo||{}).fee !== undefined ? sv.oTo.fee : 100000, 'money')) +
    fld('Xe đạp — số lượng', inp('c_xd_n', (sv.xeDap||{}).count || 0, 'number')) + fld('Xe đạp — phí 1 xe', inp('c_xd_f', (sv.xeDap||{}).fee !== undefined ? sv.xeDap.fee : 10000, 'money')) +
    '</div></div>' +
    '<div class="form-sec"><h3 class="sec">Thời gian thuê & thanh toán</h3><div class="fgrid">' +
    fld('Ngày vào (thời gian thuê từ)', inp('c_start', ct?ct.startDate:today(), 'date'), true) +
    fld('Ngày ra (đến)', inp('c_end', ct?ct.endDate:addDays(today(), 365), 'date'), true) +
    fld('Ngày ký hợp đồng', inp('c_sign', ct?ct.signDate:today(), 'date')) +
    fld('Số tháng thanh toán 1 lần', inp('c_payMonths', ct?ct.payMonths:(room?room.payMonths:1), 'number')) +
    fld('Thời gian thanh toán từ ngày', inp('c_from', ct?ct.payFromDay:(room?(room.payDay || room.payFromDay):1), 'number')) +
    fld('đến ngày', inp('c_to', ct?ct.payToDay:(room?(room.payDay || room.payToDay):3), 'number')) + '</div></div>' +
    '<div class="form-sec"><h3 class="sec">Khách hàng</h3>' +
    fld('Chọn khách có sẵn (chọn là tự điền hồ sơ, sửa được; để trống = nhập khách mới)', '<select id="c_custSel" onchange="contractCustPick(true)">' +
      '<option value="">-- Nhập khách mới --</option>' + db.customers.map(function(x){
        return '<option value="'+x.id+'"'+(cust && cust.id===x.id ? ' selected' : '')+'>'+esc(x.name + ' — ' + (x.phone||''))+'</option>'; }).join('') + '</select>') +
    custFieldsHtml('cu', cust || {}) +
    '<div class="fgrid">' + cmndPhotosHtml() + '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">'+(ct ? 'Lưu thay đổi' : 'Thêm hợp đồng')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'contracts\')">Quay lại</button></div></form>';
  setContent(h);
  /* Đợt 29: tạo mới thì chạy luôn luồng nạp theo phòng/cọc để phòng đang
     được cọc được điền từ cọc ngay khi mở form (sửa thì không). */
  window._ctIsNew = !ct;
  window._ctCustFromDep = false;
  if(!ct) contractRoomChange();
}
function saveContract(id){
  var room = byId(db.rooms, val('c_room'));
  if(!room){ toast('Vui lòng chọn phòng'); return; }
  var cur = id ? byId(db.contracts, id) : null;
  var other = activeContract(room.id);
  if(other && (!cur || other.id !== cur.id)){ toast('Phòng đã có hợp đồng đang hiệu lực'); return; }
  if(!lockSave('contract')) return;  // Đợt 25: khóa sau bước kiểm tra, mở lại ở cuối chuỗi lưu
  var custSel = val('c_custSel');
  var custData = collectCust('cu');
  var custPromise = custSel ? updateRec('customers', custSel, custData) : createRec('customers', custData);
  custPromise.then(function(cust){
    var services = { dien: { price: num(val('c_dien')), unit: val('c_dien_unit') },
      nuoc: { price: num(val('c_nuoc')), unit: val('c_nuoc_unit') },
      dienChung: { price: num(val('c_dc')) }, vesinh: { price: num(val('c_vs')) },
      internet: { price: num(val('c_net')) },
      xeMay: { count: num(val('c_xm_n')), fee: num(val('c_xm_f')) },
      oTo: { count: num(val('c_ot_n')), fee: num(val('c_ot_f')) },
      xeDap: { count: num(val('c_xd_n')), fee: num(val('c_xd_f')) } };
    var data = { houseId: room.houseId, roomId: room.id, customerId: cust.id,
      signDate: val('c_sign') || null, startDate: val('c_start') || null, endDate: val('c_end') || null,
      price: num(val('c_price')), deposit: num(val('c_deposit')), people: num(val('c_people')) || 1,
      payMonths: num(val('c_payMonths')) || 1, payFromDay: num(val('c_from')) || 1, payToDay: num(val('c_to')) || 3,
      services: services };
    var pr = cur ? updateRec('contracts', cur.id, data)
      : createRec('contracts', Object.assign({ status: 'active' }, data));
    return pr;
  }).then(function(){ toast(cur ? 'Đã lưu hợp đồng' : 'Đã tạo hợp đồng — phòng đã chuyển sang Đã thuê'); go('contracts'); unlockSave('contract'); }).catch(function(e){ errToast(e); unlockSave('contract'); });
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
  h += '<div class="btnrow"><button class="btn" onclick="go(\'contractForm\',{id:\''+c.id+'\'})">Sửa hợp đồng</button>' + (c.status==='active' ? '<button class="btn orange" onclick="go(\'liquidate\',{id:\''+c.id+'\'})">Thanh lý hợp đồng</button>' : '') +
    '<button class="btn" onclick="quickMonthly(\''+c.roomId+'\')">Tạo hóa đơn tháng này</button>' +
    '<button class="btn gray" onclick="go(\'contracts\')">Quay lại</button></div>';
  setContent(h);
}
function viewLiquidate(p){
  var c = byId(db.contracts, p.id); if(!c){ go('contracts'); return; }
  var lastD = lastReading(c.roomId, 'dien'), lastN = lastReading(c.roomId, 'nuoc');
  var h = pageTitle('Thanh lý hợp đồng ' + (c.code || '') + ' — ' + roomName(c.roomId));
  h += '<form class="form-card" onsubmit="event.preventDefault();previewLiquidate(\''+c.id+'\')">' +
    '<h3 class="sec" style="margin-top:0">Bước 1 — Chốt công tơ & thông tin thanh lý</h3><div class="liq-grid">' +
    fld('Ngày thanh lý', inp('lq_date', today(), 'date'), true) +
    fld('Điện — chỉ số cuối (trước: '+(lastD?lastD.current:0)+')', inp('lq_dien', lastD?lastD.current:'', 'number')) +
    fld('Nước — chỉ số cuối (trước: '+(lastN?lastN.current:0)+')', inp('lq_nuoc', lastN?lastN.current:'', 'number')) +
    fld('Tiền phòng đã trả thừa (vnđ)', inp('lq_prepaid', 0, 'money')) +
    '</div><label class="chk liq-refund"><input type="checkbox" id="lq_refund"> Hoàn tiền phòng thừa cho khách</label>' +
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
    var h = '<div class="card liq-card"><h3 class="sec" style="margin-top:0">Bước 2 — Tổng hợp thanh lý</h3>' +
      '<div class="liq-note"><span>Số ngày ở kỳ cuối</span><span>'+s.days+' ngày</span></div>' +
      '<div class="liq-group"><div class="liq-group-title">Các khoản khách nợ</div>' +
      '<div class="kv"><span>Tiền phòng khách nợ</span><span>'+fmt(s.roomOwed)+'</span></div>' +
      s.lines.map(function(l){ return '<div class="kv"><span>'+esc(l.label)+'</span><span>'+fmt(l.amount)+'</span></div>'; }).join('') +
      '<div class="kv liq-total"><span>Tổng khách nợ</span><span>'+fmt(s.owedTotal)+'</span></div></div>' +
      '<div class="liq-group"><div class="liq-group-title">Trả lại khách</div>' +
      '<div class="kv"><span>Trả khách (cọc + phòng thừa)</span><span>'+fmt(s.returnTotal)+'</span></div></div>' +
      '<div class="liq-result"><span>Kết quả</span><span>' + (s.net > 0 ? 'Khách đóng thêm ' + fmt(s.net) : (s.net < 0 ? 'Hoàn trả khách ' + fmt(-s.net) : 'Hòa — không thu thêm')) + '</span></div>' +
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
  /* Đợt 30: lưới HĐ chủ nhà — tiền theo VNĐ + kỳ/thời gian thanh toán đúng dữ kiện HĐ */
  h += tableHtml(['STT','Mã HĐ','Tên nhà','Địa chỉ','Chủ nhà','Tiền thuê (vnđ)','Tiền cọc (vnđ)','Kỳ thanh toán','Thời gian thanh toán','Ngày bắt đầu','Ngày kết thúc','Trạng thái',''], db.landlordContracts.map(function(lc, i){
    var hs = byId(db.houses, lc.houseId);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(lc.code||'')+'</td><td>'+esc(hs?(hs.name||hs.address):'')+'</td><td>'+esc(hs?hs.address:'')+'</td>' +
      '<td>'+esc(landlordName(lc.landlordId))+'</td><td class="price">'+fmt(lc.rentPrice)+'</td><td>'+fmt(lc.deposit)+'</td>' +
      '<td>'+((lc.payMonths||1) > 1 ? 'Mỗi ' + lc.payMonths + ' tháng' : 'Hàng tháng')+'</td><td>'+(lc.payDate ? fmtDate(lc.payDate) : 'Ngày '+(lc.payFromDay || lc.payDay || 1)+' đến '+(lc.payToDay || 3))+'</td><td>'+fmtDate(lc.startDate)+'</td><td>'+fmtDate(lc.endDate)+'</td>' +
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
    '<div class="fg"><label>Nhà</label>'+selObj('hp_house', db.houses, '', function(x){ return (x.name||x.address); })+'</div>' +
    '<div class="fg"><label>Số tiền</label>'+inp('hp_amount', '', 'money')+'</div>' +
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
  var house = byId(db.houses, val('hp_house')); if(!house){ toast('Chọn nhà'); return; }
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
    fld('Tiền thuê (vnđ)', inp('lc_rent', lc?lc.rentPrice:0, 'money')) +
    fld('Tiền cọc (vnđ)', inp('lc_deposit', lc?lc.deposit:0, 'money')) +
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
  if(!lockSave('landlordContract')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var pr = id ? updateRec('landlordContracts', id, data) : createRec('landlordContracts', data);
  pr.then(function(){ toast('Đã lưu hợp đồng chủ nhà'); contractState.sub='landlord'; go('contracts'); unlockSave('landlordContract'); }).catch(function(e){ errToast(e); unlockSave('landlordContract'); });
}
/* ----- Màn Quản lý chủ nhà (dropdown Quản lý): danh sách riêng, trước đây
   chỉ xem được bảng chủ nhà lồng trong màn Hợp đồng ----- */
var landlordFilter = { q: '' };
function viewLandlords(){
  var q = (landlordFilter.q || '').toLowerCase();
  var list = db.landlords.filter(function(l){
    return !q || (l.name || '').toLowerCase().indexOf(q) >= 0 || (l.phone || '').indexOf(q) >= 0;
  });
  var h = pageTitle('Quản lý chủ nhà');
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'landlordForm\',{back:\'landlords\'})">+ Thêm chủ nhà</button></div>';
  h += '<form class="filters" onsubmit="event.preventDefault();landlordFilter.q=val(\'llf_q\');viewLandlords();">' +
    '<div class="fg"><label>Tìm kiếm (tên/SĐT)</label>'+inp('llf_q', landlordFilter.q)+'</div>' +
    '<button class="btn">Tìm</button>' +
    '<button class="btn gray" type="button" onclick="landlordFilter.q=\'\';viewLandlords();">Tất cả</button></form>';
  h += tableHtml(['STT','Họ tên','SĐT','CMND','Địa chỉ thường trú','Email','Số nhà đang sở hữu',''], list.map(function(l, i){
    var n = db.houses.filter(function(hs){ return hs.landlordId === l.id; }).length;
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(l.name)+'</b></td><td>'+esc(l.phone)+'</td><td>'+esc(l.idCard||'')+'</td><td>'+esc(l.permanentAddress || l.address || '')+'</td><td>'+esc(l.email||'')+'</td><td>'+n+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'landlordForm\',{id:\''+l.id+'\',back:\'landlords\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Chủ nhà '+esc(l.name)+'\',\'landlords\',\''+l.id+'\',function(){ loadAll().then(function(){ go(\'landlords\'); }).catch(errToast); })">Xóa</button></td></tr>';
  }).join(''), 'Chưa có chủ nhà');
  setContent(h);
}
/* Quay lại từ form chủ nhà: vào từ màn Quản lý chủ nhà thì về đó, vào từ
   màn Hợp đồng thì về tab chủ nhà của màn Hợp đồng như cũ. */
function backFromLandlordForm(){
  if(curParams.back){ go(curParams.back); }
  else { contractState.sub='landlord'; go('contracts'); }
}
function viewLandlordForm(p){
  var l = p.id ? byId(db.landlords, p.id) : null;
  var h = pageTitle(l ? 'Sửa chủ nhà' : 'Thêm chủ nhà');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveLandlord(\''+(l?l.id:'')+'\')"><div class="fgrid">' +
    fld('Họ tên', inp('ll_name', l?l.name:''), true) + avatarPhHtml() + fld('Ngày sinh', inp('ll_dob', l?l.dob:'', 'date')) +
    fld('SDT', inp('ll_phone', l?l.phone:''), true) + fld('Giới tính', sel('ll_gender', ['Nam','Nữ','Khác'], l?l.gender:'Nam')) +
    fld('Nghề nghiệp', inp('ll_job', l?l.job:'')) + fld('Tình trạng hôn nhân', inp('ll_marital', l?l.maritalStatus:'')) +
    fld('Mail', inp('ll_email', l?l.email:'')) + fld('CMND/CCCD', inp('ll_idcard', l?l.idCard:'')) +
    /* Đợt 6 (mục 4): ảnh CMND chủ nhà tải lên thật — cùng thành phần với form nhà */
    landlordCmndHtml(l, 'll') +
    fld('Địa chỉ thường trú', inp('ll_perm', l?l.permanentAddress:'')) + fld('Địa chỉ', inp('ll_addr', l?l.address:'')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">'+(l ? 'Lưu thay đổi' : 'Thêm chủ nhà')+'</button>' +
    '<button class="btn gray" type="button" onclick="backFromLandlordForm()">Quay lại</button></div></form>';
  setContent(h);
}
function saveLandlord(id){
  if(!lockSave('landlord')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var data = { name: val('ll_name'), phone: val('ll_phone'), address: val('ll_addr'),
    dob: val('ll_dob') || null, gender: val('ll_gender'), job: val('ll_job'),
    maritalStatus: val('ll_marital'), email: val('ll_email'), idCard: val('ll_idcard'),
    permanentAddress: val('ll_perm'),
    idCardImage1: val('ll_cmnd_front'), idCardImage2: val('ll_cmnd_back') };
  var pr = id ? updateRec('landlords', id, data) : createRec('landlords', data);
  pr.then(function(){ toast('Đã lưu chủ nhà'); backFromLandlordForm(); unlockSave('landlord'); }).catch(function(e){ errToast(e); unlockSave('landlord'); });
}
VIEWS.contracts = viewContracts; VIEWS.contractForm = viewContractForm;
VIEWS.contractDetail = viewContractDetail; VIEWS.liquidate = viewLiquidate;
VIEWS.landlordContractForm = viewLandlordContractForm; VIEWS.landlordForm = viewLandlordForm;
VIEWS.landlords = viewLandlords;

/* ================================================================
   6) HÓA ĐƠN
   ================================================================ */
var invFilter = { statuses: ['unpaid','partial','paid'] };
function invTabsHtml(active){
  var tabs = [['invoices','Danh sách hóa đơn'],['monthlyForm','Tạo hóa đơn hàng tháng'],['specialInvoices','Hóa đơn đặc biệt']];
  return '<div class="tabs">' + tabs.map(function(t){
    return '<span class="tab'+(active===t[0]?' on':'')+'" onclick="go(\''+t[0]+'\')">'+t[1]+'</span>'; }).join('') + '</div>';
}
function markSent(ids, after){
  if(!ids.length){ toast('Chưa chọn hóa đơn nào để gửi'); return; }
  api('/invoices/mark-sent', 'POST', { invoiceIds: ids }).then(function(r){
    return loadColl('invoices').then(function(){
      toast('Đã đánh dấu ĐÃ GỬI cho ' + r.count + ' hóa đơn');
      (after || function(){ go(curView, curParams); })();
    });
  }).catch(errToast);
}
var invPayCount = {}; /* số lần thanh toán theo invoiceId — nạp từ /invoice-payments */
function viewInvoices(){
  /* Đợt 5: cần biết hóa đơn nào ĐÃ CÓ thanh toán để hiện icon ↻ — nạp trước rồi vẽ */
  api('/invoice-payments').then(function(pays){
    invPayCount = {};
    (pays || []).forEach(function(p2){ invPayCount[p2.invoiceId] = (invPayCount[p2.invoiceId] || 0) + 1; });
    renderInvoicesPage();
  }).catch(function(){ renderInvoicesPage(); });
}
function renderInvoicesPage(){
  var f = invFilter;
  var h = pageTitle('Danh sách hóa đơn');
  h += invTabsHtml('invoices');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('if_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('if_room', db.rooms, f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Mã hóa đơn</label>'+inp('if_code', f.code||'', 'text', 'placeholder="Tìm mã..."')+'</div>' +
    '<div class="fg"><label>Loại hóa đơn</label>'+sel('if_kind', [['','Tất cả'],['monthly','Hàng tháng'],['other','Đặc biệt']], f.kind||'')+'</div>' +
    '<div class="fg"><label>Ngày tạo — Từ</label>'+inp('if_from', f.from||'', 'date')+'</div>' +
    '<div class="fg"><label>Đến</label>'+inp('if_to', f.to||'', 'date')+'</div>' +
    '<div class="fg"><label>Trạng thái</label><span>' +
      chk('if_st_unpaid','Chưa thanh toán', f.statuses.indexOf('unpaid')>=0) +
      chk('if_st_partial','Thanh toán thiếu', f.statuses.indexOf('partial')>=0) +
      chk('if_st_paid','Thanh toán hết', f.statuses.indexOf('paid')>=0) + '</span></div>' +
    '<button class="btn" onclick="applyInvFilter()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'monthlyForm\')">Tạo hóa đơn hàng tháng</button>' +
    '<button class="btn" onclick="go(\'otherForm\')">Tạo hóa đặc biệt</button>' +
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
  /* Đợt 5: bỏ cột Gửi khỏi lưới chính (gửi nằm ở màn Tạo hóa đơn); thêm cột
     Lịch sử thanh toán dạng icon ↻ — chỉ hiện khi hóa đơn đã có thanh toán */
  h += tableHtml(['STT','Mã Hóa đơn','Tên nhà','Tên phòng','Mã Hợp đồng','Loại hóa đơn','Tổng tiền','Đã trả','Giảm giá','Còn lại','Ngày tạo hóa đơn','Trạng thái','Lịch sử thanh toán','Chi tiết'], list.map(function(inv, i){
    var ct = inv.roomId ? anyContract(inv.roomId) : null;
    var rem = (inv.total||0) - (inv.discount||0) - (inv.paidAmount||0);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(inv.code||'')+'</td><td>'+esc(houseName(inv.houseId))+'</td><td>'+esc(roomName(inv.roomId))+'</td>' +
      '<td>'+esc(ct ? (ct.code||'') : '')+'</td><td>'+(inv.kind==='monthly' ? 'Hàng tháng' : 'Đặc biệt')+'</td>' +
      '<td class="price">'+fmt(inv.total)+'</td><td>'+fmt(inv.paidAmount)+'</td><td>'+fmt(inv.discount)+'</td><td>'+fmt(rem)+'</td>' +
      '<td>'+fmtDate(inv.createdDate)+'</td><td>'+invBadge(inv)+'</td>' +
      '<td class="act">'+(invPayCount[inv.id] ? '<button class="linkbtn" title="Lịch sử thanh toán" onclick="showPayHistory(\''+inv.id+'\')">↻</button>' : '')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'invoiceDetail\',{id:\''+inv.id+'\'})">Chi tiết</button>' +
      '<button class="linkbtn" onclick="go(\'invoiceEdit\',{id:\''+inv.id+'\'})">Sửa</button>' +
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
/* Đợt 5 — nhãn khoản thu dạng chứng từ: "<Tên> theo <cách tính>" */
function invLineDocLabel(l){
  var unit = l.unit || '';
  if(l.label === 'Điện') return 'Điện theo công tơ';
  if(l.label === 'Nước'){
    if(unit === 'người') return 'Nước theo đầu người';
    if(unit === 'số') return 'Nước theo công tơ';
    if(unit === 'phòng') return 'Nước theo phòng';
    return 'Nước theo ' + unit;
  }
  var nm = (l.label === 'Internet') ? 'Mạng internet' : l.label;
  return unit ? (nm + ' theo ' + unit) : nm;
}
function viewInvoiceDetail(p){
  var inv = byId(db.invoices, p.id); if(!inv){ toast('Không tìm thấy hóa đơn'); go('invoices'); return; }
  var rem = (inv.total||0) - (inv.discount||0) - (inv.paidAmount||0);
  var isMonthly = inv.kind === 'monthly';
  var monthNum = inv.month ? Number(String(inv.month).split('-')[1]) : '';
  var svTotal = (inv.lines || []).reduce(function(s, l){ return s + (l.amount || 0); }, 0);
  /* --- Phần chứng từ (đúng ảnh thiết kế) --- */
  var h = '<div class="doc-sheet">' +
    '<h2>' + (isMonthly ? 'Hóa Đơn Tháng ' + monthNum : 'Hóa Đơn Đặc Biệt') + '</h2>' +
    '<div class="doc-line">Nhà ' + esc(houseName(inv.houseId)) + '</div>' +
    '<div class="doc-line">Phòng ' + esc(roomName(inv.roomId)) + '</div>' +
    (isMonthly
      ? '<div class="doc-line"><b>Tiền phòng tháng ' + monthNum + ':</b> ' + fmt(inv.roomFee) + '</div>' +
        '<div class="doc-line" style="margin-top:8px"><b>Tiền dịch vụ tháng ' + monthNum + '</b></div>'
      : '<div class="doc-line"><b>Lý do thu:</b> ' + esc(inv.reason || '') + '</div>' +
        (inv.roomFee ? '<div class="doc-line"><b>Tiền phòng:</b> ' + fmt(inv.roomFee) + '</div>' : '') +
        '<div class="doc-line" style="margin-top:8px"><b>Tiền dịch vụ</b></div>') +
    tableHtml(['STT','Khoản thu','Chỉ số đầu','Chỉ số cuối','Số lượng','Đơn vị','Đơn giá (vnđ)','Thành tiền (vnđ)'], (inv.lines||[]).map(function(l, i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(invLineDocLabel(l))+'</td><td>'+(l.prev==null?'':l.prev)+'</td><td>'+(l.current==null?'':l.current)+'</td><td>'+l.qty+'</td><td>'+esc(l.unit)+'</td><td>'+fmtNum(l.unitPrice)+'</td><td class="price">'+fmtNum(l.amount)+'</td></tr>';
    }).join('') + '<tr class="total"><td colspan="7">Tổng dịch vụ</td><td>' + fmtNum(svTotal) + '</td></tr>', 'Không có dòng dịch vụ') +
    '<div class="doc-line" style="margin-top:10px;font-size:16px"><b>Tổng hóa đơn: ' + fmtNum(inv.total) + ' vnđ</b></div>' +
    '<div class="doc-line" style="color:#757575">Mã hóa đơn: ' + esc(inv.code || '') + ' — Ngày tạo: ' + fmtDate(inv.createdDate) + '</div>' +
    '</div>';
  /* --- Khung Quản lý thanh toán (chức năng như cũ) --- */
  h += '<div class="card noprint" style="max-width:820px;margin:14px auto 0"><h3 class="sec" style="margin-top:0">Quản lý thanh toán</h3>' +
    '<div class="kv"><span>Trạng thái thanh toán</span><span>'+invBadge(inv)+'</span></div>' +
    '<div class="kv"><span>Trạng thái gửi</span><span>'+sentBadge(inv)+(inv.sent && inv.sentDate ? ' — ngày gửi ' + fmtDate(inv.sentDate) : '')+'</span></div>' +
    '<div class="kv"><span>Tổng hóa đơn</span><span>'+fmt(inv.total)+'</span></div>' +
    '<div class="kv"><span>Giảm giá</span><span>- '+fmt(inv.discount)+'</span></div>' +
    '<div class="kv"><span>Đã trả</span><span>'+fmt(inv.paidAmount)+'</span></div>' +
    '<div class="kv"><span>Còn lại</span><span>'+fmt(rem)+'</span></div>';
  if(rem > 0){
    h += '<h3 class="sec">Ghi thanh toán</h3><div class="fgrid">' +
      fld('Số tiền', inp('pay_amount', rem, 'money'), true) +
      fld('Ngày', inp('pay_date', today(), 'date')) +
      fld('Người nhận', inp('pay_receiver', currentUser ? currentUser.name : '')) +
      fld('Ghi chú', inp('pay_note', '')) + '</div>' +
      '<div class="btnrow"><button class="btn green" onclick="savePayment(\''+inv.id+'\')">Ghi thanh toán (tự tạo phiếu thu)</button></div>';
  }
  h += '<h3 class="sec">Lịch sử thanh toán</h3><div id="inv_pay_history"><div class="empty-note">Đang tải...</div></div>' +
    '<div class="btnrow"><button class="btn" onclick="go(\'invoicePrint\',{id:\''+inv.id+'\'})">In hóa đơn</button>' +
    '<button class="btn" onclick="go(\'invoiceEdit\',{id:\''+inv.id+'\'})">Sửa hóa đơn</button>' +
    (!inv.sent ? '<button class="btn green" onclick="markSent([\''+inv.id+'\'], function(){ go(\'invoiceDetail\', { id: \''+inv.id+'\' }); })">Gửi hóa đơn</button>' : '') +
    '</div></div>';
  h += '<div class="btnrow noprint" style="max-width:820px;margin:12px auto"><button class="btn gray" onclick="go(\'invoices\')">Quay lại</button></div>';
  setContent(h);
  api('/invoices/' + inv.id + '/payments').then(function(pays){
    var el = document.getElementById('inv_pay_history'); if(!el) return;
    el.innerHTML = pays.length ? tableHtml(['Thời gian thanh toán','Số tiền thanh toán','Người nhận'], pays.map(function(p2){
      return '<tr><td>'+fmtDate(p2.date)+'</td><td class="price">'+fmt(p2.amount)+'</td><td>'+esc(p2.receiver)+'</td></tr>';
    }).join('')) : '<div class="empty-note">Chưa có lần thanh toán nào</div>';
  }).catch(function(){ var el = document.getElementById('inv_pay_history'); if(el) el.innerHTML = ''; });
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
    fld('Tiền phòng (vnđ)', inp('ie_roomfee', inv.roomFee, 'money')) +
    fld('Giảm giá (vnđ)', inp('ie_discount', inv.discount, 'money')) +
    fld('Ngày tạo', inp('ie_date', inv.createdDate || '', 'date')) +
    fld('Lý do (hóa đơn đặc biệt)', inp('ie_reason', inv.reason || '')) + '</div>' +
    '<h3 class="sec">Dòng dịch vụ (Thành tiền = Đơn giá × Số lượng, tự tính khi lưu)</h3>' +
    '<div id="ie_lines">' + (inv.lines||[]).map(function(l, i){
      return '<div class="fgrid"><div>'+fld('Khoản thu', inp('ie_l_label_'+i, l.label))+'</div>' +
        '<div>'+fld('Đơn giá', inp('ie_l_price_'+i, l.unitPrice, 'money'))+'</div>' +
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
      return '<tr><td>'+(i+1)+'</td><td>'+esc(invLineDocLabel(l))+'</td><td>'+(l.prev==null?'':l.prev)+'</td><td>'+(l.current==null?'':l.current)+'</td><td>'+l.qty+'</td><td>'+esc(l.unit)+'</td><td>'+fmt(l.unitPrice)+'</td><td>'+fmt(l.amount)+'</td></tr>';
    }).join('') + '<tr class="total"><td colspan="7">Tổng dịch vụ</td><td>' + fmt((inv.lines||[]).reduce(function(s, l){ return s + (l.amount||0); }, 0)) + '</td></tr>', 'Không có dòng dịch vụ') +
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
    /* Rà soát đợt 5: cột đúng lưới "Lich su thanh toan Hoa Don" của thiết kế */
    h += tableHtml(['STT','Mã hóa đơn','Tên nhà','Tên phòng','Mã Hợp đồng','Thời gian thanh toán','Số tiền thanh toán'], pays.map(function(p2, i){
      var inv = byId(db.invoices, p2.invoiceId);
      var ct = inv && inv.roomId ? anyContract(inv.roomId) : null;
      return '<tr><td>'+(i+1)+'</td><td>'+esc(inv ? (inv.code||'') : '')+'</td><td>'+esc(inv ? houseName(inv.houseId) : '')+'</td><td>'+esc(inv ? roomName(inv.roomId) : '')+'</td>' +
        '<td>'+esc(ct ? (ct.code||'') : '')+'</td><td>'+fmtDate(p2.date)+'</td><td class="price">'+fmt(p2.amount)+'</td></tr>';
    }).join(''), 'Chưa có lần thanh toán nào');
    setContent(h);
  }).catch(errToast);
}
/* ----- Màn Tạo hóa đơn hàng tháng: bảng phòng + tạo lẻ/batch + gửi (SPEC-WEB-2 F) ----- */
var monthlyState = { fromMonth:'', toMonth:'', houseId:'', roomId:'', stNew:true, stNotSent:true, stSent:true, batchDone:false, results:null };
function monthRangeList(from, to){
  var out = [];
  if(!from) return out;
  if(!to || to < from) to = from;
  var y = Number(from.slice(0,4)), m = Number(from.slice(5,7));
  var ey = Number(to.slice(0,4)), em = Number(to.slice(5,7));
  while((y < ey || (y === ey && m <= em)) && out.length < 12){
    out.push(y + '-' + String(m).padStart(2,'0'));
    m++; if(m > 12){ m = 1; y++; }
  }
  return out;
}
function monthlyInvOf(roomId, month){
  for(var i=0;i<db.invoices.length;i++){ var v = db.invoices[i];
    if(v.kind==='monthly' && v.roomId===roomId && v.month===month) return v; }
  return null;
}
function viewMonthlyForm(){
  var st = monthlyState;
  var fromM = st.fromMonth || curMonth();
  var toM = st.toMonth || fromM;
  var months = monthRangeList(fromM, toM);
  var h = pageTitle('Tạo hóa đơn hàng tháng');
  h += invTabsHtml('monthlyForm');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('mb_house', db.houses, st.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('mb_room', db.rooms.filter(function(r){ return !st.houseId || r.houseId === st.houseId; }), st.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Thời gian — Từ tháng</label>'+inp('mb_from', fromM, 'month')+'</div>' +
    '<div class="fg"><label>Đến tháng</label>'+inp('mb_to', toM, 'month')+'</div>' +
    '<div class="fg"><label>Trạng thái</label><span>' +
      chk('mb_st_new','Chưa tạo', st.stNew) + chk('mb_st_notsent','Chưa gửi', st.stNotSent) + chk('mb_st_sent','Đã gửi', st.stSent) + '</span></div>' +
    '<button class="btn" onclick="applyMonthlyFilter()">Lọc</button></div>';
  h += '<div class="btnrow">' +
    '<button class="btn green" onclick="mbCreateSelected()">Tạo hóa đơn</button>' +
    '<button class="btn" id="mb_batch_btn" onclick="mbCreateAll()">'+(st.batchDone ? 'Tạo lại toàn bộ hóa đơn' : 'Tạo toàn bộ hóa đơn')+'</button>' +
    '<button class="btn" onclick="mbSendSelected()">Gửi Hóa đơn</button>' +
    '<button class="btn gray" onclick="go(\'invoices\')">Quay lại DS hóa đơn</button></div>';
  h += '<div id="mb_results">' + mbResultsHtml() + '</div>';
  var rooms = db.rooms.filter(function(r){ return !!activeContract(r.id); });
  if(st.houseId) rooms = rooms.filter(function(r){ return r.houseId === st.houseId; });
  if(st.roomId) rooms = rooms.filter(function(r){ return r.id === st.roomId; });
  var rows = [];
  rooms.forEach(function(r){
    months.forEach(function(mo){
      var inv = monthlyInvOf(r.id, mo);
      var stt = !inv ? 'new' : (inv.sent ? 'sent' : 'notsent');
      rows.push({ room: r, month: mo, inv: inv, stt: stt });
    });
  });
  rows = rows.filter(function(x){
    if(x.stt==='new' && !st.stNew) return false;
    if(x.stt==='notsent' && !st.stNotSent) return false;
    if(x.stt==='sent' && !st.stSent) return false;
    return true;
  });
  h += '<div class="tblwrap"><table><thead><tr><th>STT</th><th>Tên nhà</th><th>Tên phòng</th><th>Hóa đơn tháng</th><th>Trạng thái</th>' +
    '<th><label class="chk" style="padding:0"><input type="checkbox" id="mb_all" onchange="document.querySelectorAll(\'.mb_chk\').forEach(function(x){ x.checked = this.checked; }.bind(this))"> Tất cả/Bỏ tất cả</label></th><th>Chi tiết</th></tr></thead><tbody>' +
    (rows.length ? rows.map(function(x, i){
      var label = x.stt==='new' ? '<span class="badge b-unpaid">Chưa tạo</span>' : (x.stt==='sent' ? '<span class="badge b-paid">Đã gửi</span>' : '<span class="badge b-partial">Chưa gửi</span>');
      return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(x.room.houseId))+'</td><td><b>'+esc(x.room.name)+'</b></td><td>'+esc(fmtUtilMonth(x.month))+'</td><td>'+label+'</td>' +
        '<td><input type="checkbox" class="mb_chk" value="'+x.room.id+'" data-month="'+x.month+'" data-inv="'+(x.inv?x.inv.id:'')+'"></td>' +
        '<td class="act">'+(x.inv ? '<button class="linkbtn" onclick="go(\'invoiceDetail\',{id:\''+x.inv.id+'\'})">Chi tiết</button>' : '')+'</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty-note">Không có phòng × tháng nào khớp bộ lọc (khoảng tối đa 12 tháng)</div></td></tr>') +
    '</tbody></table></div>';
  setContent(h);
}
function mbResultsHtml(){
  var res = monthlyState.results;
  if(!res || !res.length) return '';
  return '<div class="card" style="margin-bottom:14px"><h3 class="sec" style="margin-top:0">Kết quả tạo hóa đơn</h3>' +
    tableHtml(['Phòng','Tháng','Kết quả'], res.map(function(r){
      var inv = r.invoiceId ? byId(db.invoices, r.invoiceId) : null;
      return '<tr><td>'+esc(roomName(r.roomId))+'</td><td>'+esc(fmtUtilMonth(r.month || monthlyState.fromMonth || curMonth()))+'</td><td>'+
        (r.ok ? '<span class="badge b-paid">Đã tạo</span> ' + esc(inv ? (inv.code || '') : (r.invoiceId || ''))
              : '<span class="badge b-unpaid">Lỗi: '+esc(r.error||'')+'</span>')+'</td></tr>';
    }).join('')) + '</div>';
}
function applyMonthlyFilter(){
  var from = val('mb_from') || curMonth();
  var to = val('mb_to') || from;
  if(to < from){ toast('Tháng kết thúc phải >= tháng bắt đầu'); return; }
  if(monthRangeList(from, to).length >= 12 && to > monthRangeList(from, to)[11]){
    toast('Khoảng thời gian tối đa 12 tháng — đã tự giới hạn đến ' + fmtUtilMonth(monthRangeList(from, to)[11]));
    to = monthRangeList(from, to)[11];
  }
  monthlyState.fromMonth = from; monthlyState.toMonth = to;
  monthlyState.houseId = val('mb_house'); monthlyState.roomId = val('mb_room');
  monthlyState.stNew = isChk('mb_st_new'); monthlyState.stNotSent = isChk('mb_st_notsent'); monthlyState.stSent = isChk('mb_st_sent');
  viewMonthlyForm();
}
function mbSelected(){
  return Array.prototype.map.call(document.querySelectorAll('.mb_chk:checked'), function(x){
    return { roomId: x.value, month: x.getAttribute('data-month') || '', invoiceId: x.getAttribute('data-inv') || '' };
  });
}
function mbCreateSelected(){
  var sel = mbSelected();
  if(!sel.length){ toast('Hãy chọn ít nhất 1 dòng'); return; }
  var results = [];
  var chain = Promise.resolve();
  sel.forEach(function(s){
    if(s.invoiceId){ results.push({ roomId: s.roomId, month: s.month, ok: false, error: 'Đã có hóa đơn tháng' }); return; }
    chain = chain.then(function(){
      return api('/invoices/monthly', 'POST', { roomId: s.roomId, month: s.month })
        .then(function(inv){ results.push({ roomId: s.roomId, month: s.month, ok: true, invoiceId: inv.id }); })
        .catch(function(e){ results.push({ roomId: s.roomId, month: s.month, ok: false, error: e.message }); });
    });
  });
  chain.then(function(){ return loadColl('invoices'); }).then(function(){
    monthlyState.results = results; viewMonthlyForm();
    toast('Đã xử lý ' + results.length + ' dòng: tạo được ' + results.filter(function(r){ return r.ok; }).length);
  }).catch(errToast);
}
function mbCreateAll(){
  if(monthlyState.batchDone){
    openModal('<h3>Tạo lại toàn bộ hóa đơn</h3>' +
      '<p style="font-size:14px">Chức năng tạo tất cả hóa đơn đã được thực hiện. Bạn có chắc chắn muốn tạo lại không?</p>' +
      '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Hủy</button>' +
      '<button class="btn green" onclick="closeModal();mbRunBatch()">Tạo lại</button></div>');
    return;
  }
  mbRunBatch();
}
function mbRunBatch(){
  var from = monthlyState.fromMonth || curMonth();
  var to = monthlyState.toMonth || from;
  var btn = document.getElementById('mb_batch_btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Đang tạo hóa đơn...'; }
  api('/invoices/monthly-batch', 'POST', { month: from, toMonth: to }).then(function(r){
    return loadColl('invoices').then(function(){
      monthlyState.batchDone = true;
      monthlyState.results = r.results;
      viewMonthlyForm();
      toast('Batch xong: tạo mới ' + r.created + ' hóa đơn, ' + r.failed + ' dòng lỗi/bỏ qua');
    });
  }).catch(function(e){ errToast(e); viewMonthlyForm(); });
}
function mbSendSelected(){
  var ids = mbSelected().filter(function(s){ return s.invoiceId; }).map(function(s){ return s.invoiceId; });
  var unsent = ids.filter(function(id){ var v = byId(db.invoices, id); return v && !v.sent; });
  if(!unsent.length){ toast('Hãy chọn ít nhất 1 hóa đơn ĐÃ TẠO (chưa gửi)'); return; }
  markSent(unsent, function(){ viewMonthlyForm(); });
}
/* ----- Hóa đơn đặc biệt: danh sách + gửi (SPEC-WEB-2 F.2) ----- */
var specialFilter = { houseId:'', roomId:'', reason:'', from:'', to:'', notSent:true, sent:true };
function viewSpecialInvoices(){
  var f = specialFilter;
  var h = pageTitle('Danh sách hóa đơn đặc biệt');
  h += invTabsHtml('specialInvoices');
  /* Đợt 5 (mục 11): bộ lọc có đủ 2 select Nhà trọ / Phòng trọ + Lý Do thu + Ngày tạo + 2 checkbox gửi */
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('sf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('sf_room', db.rooms.filter(function(r){ return !f.houseId || r.houseId === f.houseId; }), f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Lý Do thu</label>'+inp('sf_reason', f.reason, 'text', 'placeholder="Tìm lý do..."')+'</div>' +
    '<div class="fg"><label>Ngày tạo — Từ</label>'+inp('sf_from', f.from, 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp('sf_to', f.to, 'date')+'</div>' +
    '<div class="fg"><label>Trạng thái</label><span>' +
      chk('sf_notsent','Chưa gửi', f.notSent) + chk('sf_sent','Đã gửi', f.sent) + '</span></div>' +
    '<button class="btn" onclick="specialFilter={houseId:val(\'sf_house\'),roomId:val(\'sf_room\'),reason:val(\'sf_reason\'),from:val(\'sf_from\'),to:val(\'sf_to\'),notSent:isChk(\'sf_notsent\'),sent:isChk(\'sf_sent\')};viewSpecialInvoices()">Lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'otherForm\')">Tạo hóa đơn đặc biệt</button>' +
    '<button class="btn" onclick="spSendSelected()">Gửi Hóa đơn</button>' +
    '<button class="btn gray" onclick="go(\'specialSend\')">Màn hình gửi hóa đơn</button></div>';
  var list = db.invoices.filter(function(inv){
    if(inv.kind !== 'other') return false;
    if(f.houseId && inv.houseId !== f.houseId) return false;
    if(f.roomId && inv.roomId !== f.roomId) return false;
    if(f.reason && (inv.reason||'').toLowerCase().indexOf(f.reason.toLowerCase())<0) return false;
    if(f.from && (inv.createdDate||'') < f.from) return false;
    if(f.to && (inv.createdDate||'') > f.to) return false;
    if(inv.sent && !f.sent) return false;
    if(!inv.sent && !f.notSent) return false;
    return true;
  });
  h += '<div class="tblwrap"><table><thead><tr><th>STT</th><th>Tên nhà</th><th>Tên phòng</th><th>Ngày tạo</th><th>Trạng thái</th><th>Lý do thu</th><th>Số tiền thu</th>' +
    '<th><label class="chk" style="padding:0"><input type="checkbox" id="sp_all" onchange="document.querySelectorAll(\'.sp_chk\').forEach(function(x){ x.checked = this.checked; }.bind(this))"> Tất cả/Bỏ tất cả</label></th><th></th></tr></thead><tbody>' +
    (list.length ? list.map(function(inv, i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(inv.houseId))+'</td><td>'+esc(roomName(inv.roomId))+'</td><td>'+fmtDate(inv.createdDate)+'</td>' +
        '<td>'+sentBadge(inv)+'</td><td>'+esc(inv.reason||'')+'</td><td class="price">'+fmt(inv.total)+'</td>' +
        '<td><input type="checkbox" class="sp_chk" value="'+inv.id+'"></td>' +
        '<td class="act"><button class="linkbtn" onclick="go(\'invoiceDetail\',{id:\''+inv.id+'\'})">Chi tiết</button></td></tr>';
    }).join('') : '<tr><td colspan="9"><div class="empty-note">Chưa có hóa đơn đặc biệt nào</div></td></tr>') +
    '</tbody></table></div>';
  setContent(h);
}
function spSendSelected(){
  var ids = Array.prototype.map.call(document.querySelectorAll('.sp_chk:checked'), function(x){ return x.value; });
  var unsent = ids.filter(function(id){ var v = byId(db.invoices, id); return v && !v.sent; });
  if(!unsent.length){ toast('Hãy chọn ít nhất 1 hóa đơn chưa gửi'); return; }
  markSent(unsent, function(){ viewSpecialInvoices(); });
}
/* ----- Đợt 5 (mục 13): Màn GỬI hóa đơn đặc biệt riêng — chỉ liệt kê hóa đơn
   đặc biệt CHƯA GỬI khớp bộ lọc; bảng gọn Tên nhà/Tên phòng + checkbox ----- */
var spSendFilter = { houseId:'', roomId:'', reason:'', from:'', to:'' };
function spSendList(){
  var f = spSendFilter;
  return db.invoices.filter(function(inv){
    if(inv.kind !== 'other' || inv.sent) return false;
    if(f.houseId && inv.houseId !== f.houseId) return false;
    if(f.roomId && inv.roomId !== f.roomId) return false;
    if(f.reason && (inv.reason||'').toLowerCase().indexOf(f.reason.toLowerCase())<0) return false;
    if(f.from && (inv.createdDate||'') < f.from) return false;
    if(f.to && (inv.createdDate||'') > f.to) return false;
    return true;
  });
}
function viewSpecialSend(){
  var f = spSendFilter;
  var h = pageTitle('Gửi hóa đơn đặc biệt');
  h += invTabsHtml('specialInvoices');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('ss_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('ss_room', db.rooms.filter(function(r){ return !f.houseId || r.houseId === f.houseId; }), f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Lý Do thu</label>'+inp('ss_reason', f.reason, 'text', 'placeholder="Tìm lý do..."')+'</div>' +
    '<div class="fg"><label>Ngày tạo — Từ</label>'+inp('ss_from', f.from, 'date')+'</div>' +
    '<div class="fg"><label>đến</label>'+inp('ss_to', f.to, 'date')+'</div>' +
    '<button class="btn" onclick="spSendFilter={houseId:val(\'ss_house\'),roomId:val(\'ss_room\'),reason:val(\'ss_reason\'),from:val(\'ss_from\'),to:val(\'ss_to\')};viewSpecialSend()">Lọc</button></div>';
  var list = spSendList();
  h += '<div class="tblwrap"><table><thead><tr><th>STT</th><th>Tên nhà</th><th>Tên phòng</th>' +
    '<th><label class="chk" style="padding:0"><input type="checkbox" id="ss_all" onchange="document.querySelectorAll(\'.ss_chk\').forEach(function(x){ x.checked = this.checked; }.bind(this))"> Tất cả/Bỏ tất cả</label></th></tr></thead><tbody>' +
    (list.length ? list.map(function(inv, i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(inv.houseId))+'</td><td><b>'+esc(roomName(inv.roomId))+'</b></td>' +
        '<td><input type="checkbox" class="ss_chk" value="'+inv.id+'"></td></tr>';
    }).join('') : '<tr><td colspan="4"><div class="empty-note">Không còn hóa đơn đặc biệt chưa gửi nào khớp bộ lọc</div></td></tr>') +
    '</tbody></table></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="ssSend(false)">Gửi</button>' +
    '<button class="btn" onclick="ssSend(true)">Gửi tất cả</button>' +
    '<button class="btn gray" onclick="go(\'specialInvoices\')">Quay lại DS hóa đơn đặc biệt</button></div>';
  setContent(h);
}
function ssSend(all){
  var ids = all ? spSendList().map(function(inv){ return inv.id; })
    : Array.prototype.map.call(document.querySelectorAll('.ss_chk:checked'), function(x){ return x.value; });
  if(!ids.length){ toast(all ? 'Không có hóa đơn chưa gửi nào để gửi' : 'Hãy chọn ít nhất 1 hóa đơn'); return; }
  markSent(ids, function(){ viewSpecialSend(); });
}
/* ----- Tạo hóa đơn đặc biệt: 3 trường ở trên + bảng chọn phòng ở dưới (mục 12) ----- */
function viewOtherForm(){
  var h = pageTitle('Tạo hóa đơn đặc biệt');
  h += invTabsHtml('specialInvoices');
  h += '<form class="form-card" onsubmit="event.preventDefault();"><div class="fgrid">' +
    fld('Lý Do thu', inp('of_reason', ''), true) +
    fld('Số tiền thu (vnđ)', inp('of_amount', '', 'money', 'placeholder="VD: 200000"'), true) +
    '</div>' +
    fld('Ghi chú', '<textarea id="of_note"></textarea>') +
    '<h3 class="sec">Chọn người nhận hóa đơn</h3>' +
    '<div class="filters" style="box-shadow:none;padding:0">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('of_house', db.houses, '', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng trọ</label>'+selObj('of_room', db.rooms, '', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div></div>' +
    '<div class="tblwrap"><table><thead><tr><th>STT</th><th>Tên nhà</th><th>Tên phòng</th>' +
    '<th><label class="chk" style="padding:0"><input type="checkbox" id="of_all" onchange="document.querySelectorAll(\'.of_room\').forEach(function(x){ x.checked = this.checked; }.bind(this))"> Tất cả/Bỏ tất cả</label></th></tr></thead>' +
    '<tbody id="of_room_rows"></tbody></table></div>' +
    '<div class="btnrow"><button class="btn green" type="button" onclick="saveOther(false)">Tạo hóa đơn đặc biệt</button>' +
    '<button class="btn" type="button" onclick="saveOther(true)">Tạo hóa đơn đặc biệt cho tất cả</button>' +
    '<button class="btn gray" type="button" onclick="go(\'specialInvoices\')">Quay lại</button></div></form>';
  setContent(h);
  var hs = document.getElementById('of_house');
  hs.onchange = filterOtherRooms;
  var rs = document.getElementById('of_room');
  rs.onchange = filterOtherRooms;
  filterOtherRooms();
}
function filterOtherRooms(){
  var houseId = val('of_house'), roomId = val('of_room');
  var rows = db.rooms.filter(function(r){
    if(houseId && r.houseId !== houseId) return false;
    if(roomId && r.id !== roomId) return false;
    return true;
  });
  var tb = document.getElementById('of_room_rows'); if(!tb) return;
  tb.innerHTML = rows.length ? rows.map(function(r, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(r.houseId))+'</td><td><b>'+esc(r.name)+'</b></td>' +
      '<td><input type="checkbox" class="of_room" value="'+r.id+'"></td></tr>';
  }).join('') : '<tr><td colspan="4"><div class="empty-note">Không có phòng nào khớp</div></td></tr>';
}
function saveOther(forAll){
  var amount = num(val('of_amount'));
  var reason = val('of_reason');
  var note = val('of_note');
  if(!reason){ toast('Nhập lý do thu'); return; }
  if(!amount){ toast('Nhập số tiền thu'); return; }
  var roomIds;
  if(forAll){
    var seen = {};
    roomIds = db.rooms.filter(function(r){ return !!activeContract(r.id); }).map(function(r){ return r.id; });
    if(!roomIds.length){ toast('Không có phòng nào có hợp đồng đang hiệu lực'); return; }
  } else {
    roomIds = Array.prototype.map.call(document.querySelectorAll('.of_room:checked'), function(x){ return x.value; });
    if(!roomIds.length){ toast('Hãy chọn ít nhất 1 phòng'); return; }
  }
  var fullReason = note ? (reason + ' — ' + note) : reason;
  var jobs = roomIds.map(function(rid){
    var room = byId(db.rooms, rid);
    return api('/invoices', 'POST', { kind: 'other', houseId: room.houseId, roomId: rid, reason: fullReason,
      createdDate: today(), lines: [{ label: reason, unitPrice: amount, unit: 'phòng', qty: 1, amount: amount }] });
  });
  Promise.all(jobs).then(function(){ return loadColl('invoices'); })
    .then(function(){ toast('Đã tạo ' + jobs.length + ' hóa đơn đặc biệt'); go('specialInvoices'); }).catch(errToast);
}
VIEWS.invoices = viewInvoices; VIEWS.invoiceDetail = viewInvoiceDetail; VIEWS.invoiceEdit = viewInvoiceEdit;
VIEWS.invoicePrint = viewInvoicePrint; VIEWS.paymentsAll = viewPaymentsAll;
VIEWS.monthlyForm = viewMonthlyForm; VIEWS.otherForm = viewOtherForm; VIEWS.specialInvoices = viewSpecialInvoices; VIEWS.specialSend = viewSpecialSend;

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
function showReceiptDetail(id){
  var r = byId(db.receipts, id); if(!r) return;
  var inv = r.invoiceId ? byId(db.invoices, r.invoiceId) : null;
  openModal('<h3>Chi tiết phiếu thu ' + esc(r.code || '') + '</h3><div class="card" style="box-shadow:none;padding:0">' +
    '<div class="kv"><span>Mã phiếu thu</span><span>'+esc(r.code||'')+'</span></div>' +
    '<div class="kv"><span>Khoản thu</span><span>'+esc(r.title)+'</span></div>' +
    '<div class="kv"><span>Số tiền thu</span><span>'+fmt(r.amount)+'</span></div>' +
    '<div class="kv"><span>Nhà / Phòng</span><span>'+esc(houseName(r.houseId))+' / '+esc(roomName(r.roomId))+'</span></div>' +
    '<div class="kv"><span>Mã hợp đồng</span><span>'+esc(r.contractCode||'')+'</span></div>' +
    '<div class="kv"><span>Mã hóa đơn</span><span>'+esc(inv ? (inv.code||'') : '')+'</span></div>' +
    '<div class="kv"><span>Ngày tạo</span><span>'+fmtDate(r.createdDate)+'</span></div>' +
    '<div class="kv"><span>Ngày thu</span><span>'+fmtDate(r.collectDate)+'</span></div>' +
    '<div class="kv"><span>Người thu</span><span>'+esc(r.collector||'')+'</span></div>' +
    '<div class="kv"><span>Người nộp</span><span>'+esc(r.payer||'')+'</span></div>' +
    '<div class="kv"><span>Ghi chú</span><span>'+esc(r.note||'')+'</span></div></div>' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Đóng</button></div>');
}
function showExpenseDetail(id){
  var e = byId(db.expenses, id); if(!e) return;
  openModal('<h3>Chi tiết phiếu chi ' + esc(e.code || '') + '</h3><div class="card" style="box-shadow:none;padding:0">' +
    '<div class="kv"><span>Mã phiếu chi</span><span>'+esc(e.code||'')+'</span></div>' +
    '<div class="kv"><span>Khoản chi</span><span>'+esc(e.title)+'</span></div>' +
    '<div class="kv"><span>Số tiền chi</span><span>'+fmt(e.amount)+'</span></div>' +
    '<div class="kv"><span>Nhà / Phòng</span><span>'+esc(houseName(e.houseId))+' / '+esc(roomName(e.roomId))+'</span></div>' +
    '<div class="kv"><span>Mã hợp đồng</span><span>'+esc(e.contractCode||'')+'</span></div>' +
    '<div class="kv"><span>Ngày tạo</span><span>'+fmtDate(e.date)+'</span></div>' +
    '<div class="kv"><span>Ngày chi</span><span>'+fmtDate(e.payDate || e.date)+'</span></div>' +
    '<div class="kv"><span>Người chi</span><span>'+esc(e.spender||'')+'</span></div>' +
    '<div class="kv"><span>Người nhận</span><span>'+esc(e.receiverName||'')+'</span></div>' +
    '<div class="kv"><span>SDT người nhận</span><span>'+esc(e.receiverPhone||'')+'</span></div>' +
    '<div class="kv"><span>Ghi chú</span><span>'+esc(e.note||'')+'</span></div></div>' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Đóng</button></div>');
}
function financeThuHtml(){
  var f = finThuF;
  var h = finFilterHtml('ft', f, ['Người thu','Người nộp','Ngày thu']);
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'receiptForm\')">+ Thêm khoản thu</button></div>';
  var list = db.receipts.filter(function(r){ return finMatch(f, r.houseId, r.roomId, r.collector, r.payer, r.createdDate, r.collectDate); });
  var total = list.reduce(function(s, r){ return s + (r.amount||0); }, 0);
  /* Đợt 5 (mục 14): bảng Thu đúng cột của ảnh — có Mã hóa đơn, bỏ cột Khoản thu
     (khoản thu vẫn xem được trong Chi tiết phiếu thu) */
  h += tableHtml(['STT','Mã phiếu thu','Tên nhà','Tên phòng','Mã Hợp đồng','Mã hóa đơn','Ngày tạo','Ngày thu','Người thu','Người nộp','Số tiền thu',''], list.map(function(r, i){
    var inv = r.invoiceId ? byId(db.invoices, r.invoiceId) : null;
    return '<tr><td>'+(i+1)+'</td><td>'+esc(r.code||'')+'</td><td>'+esc(houseName(r.houseId))+'</td><td>'+esc(roomName(r.roomId))+'</td>' +
      '<td>'+esc(r.contractCode||'')+'</td><td>'+esc(inv ? (inv.code||'') : '')+'</td><td>'+fmtDate(r.createdDate)+'</td><td>'+fmtDate(r.collectDate)+'</td>' +
      '<td>'+esc(r.collector)+'</td><td>'+esc(r.payer)+'</td><td class="price">'+fmt(r.amount)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="showReceiptDetail(\''+r.id+'\')">Chi tiết</button>' +
      '<button class="linkbtn" onclick="go(\'receiptForm\',{id:\''+r.id+'\'})">Sửa</button>' +
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
  h += tableHtml(['STT','Mã phiếu chi','Tên nhà','Tên phòng','Mã Hợp đồng','Khoản Chi','Ngày tạo','Ngày chi','Người chi','Người nhận','SĐT người nhận','Số tiền chi',''], list.map(function(e, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(e.code||'')+'</td><td>'+esc(houseName(e.houseId))+'</td><td>'+esc(roomName(e.roomId))+'</td>' +
      '<td>'+esc(e.contractCode||'')+'</td><td>'+esc(e.title)+'</td><td>'+fmtDate(e.date)+'</td><td>'+fmtDate(e.payDate || e.date)+'</td>' +
      '<td>'+esc(e.spender||'')+'</td><td>'+esc(e.receiverName||'')+'</td><td>'+esc(e.receiverPhone||'')+'</td><td class="price">'+fmt(e.amount)+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="showExpenseDetail(\''+e.id+'\')">Chi tiết</button>' +
      '<button class="linkbtn" onclick="go(\'expenseForm\',{id:\''+e.id+'\'})">Sửa</button>' +
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
/* ----- Đợt 5 (mục 15/17): chọn xếp tầng Nhà → Phòng → Khách thuê dùng chung
   cho form phiếu thu / phiếu chi (khách lấy từ HĐ đang thuê của phòng) ----- */
function finRoomOptions(houseId, selectedId){
  return db.rooms.filter(function(x){ return !houseId || x.houseId === houseId; }).map(function(x){
    return '<option value="'+x.id+'"'+(selectedId === x.id ? ' selected' : '')+'>'+esc(x.name + ' (' + houseName(x.houseId) + ')')+'</option>';
  }).join('');
}
function finCustRefresh(prefix, selectedCustId){
  var roomId = val(prefix + '_room');
  var ct = roomId ? activeContract(roomId) : null;
  var selEl = document.getElementById(prefix + '_cust'); if(!selEl) return;
  var custId = selectedCustId || (ct ? ct.customerId : '');
  selEl.innerHTML = '<option value="">-- Chọn khách thuê --</option>' +
    (ct ? '<option value="'+ct.customerId+'"'+(custId === ct.customerId ? ' selected' : '')+'>'+esc(customerName(ct.customerId) + ' — ' + (byId(db.customers, ct.customerId) || {}).phone + '')+'</option>' : '');
}
function finHouseChange(prefix){
  var roomSel = document.getElementById(prefix + '_room'); if(!roomSel) return;
  roomSel.innerHTML = finRoomOptions(val(prefix + '_house'), '');
  finCustRefresh(prefix);
}
function finRoomChange(prefix){ finCustRefresh(prefix); }
function finTabsHtml(active){
  return '<div class="tabs"><span class="tab'+(active==='thu'?' on':'')+'" onclick="go(\'receiptForm\')">Thu</span>' +
    '<span class="tab'+(active==='chi'?' on':'')+'" onclick="go(\'expenseForm\')">Chi</span></div>';
}
function viewReceiptForm(p){
  var r = p.id ? byId(db.receipts, p.id) : null;
  var ct0 = r && r.roomId ? activeContract(r.roomId) : null;
  var payerIsCust = !!(r && ct0 && r.payer && r.payer === customerName(ct0.customerId));
  var h = pageTitle(r ? 'Sửa khoản thu' : 'Thêm khoản thu');
  h += finTabsHtml('thu');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveReceipt(\''+(r?r.id:'')+'\')"><div class="fgrid">' +
    fld('Khoản thu', inp('rc_title', r?r.title:''), true) +
    fld('Số tiền thu (vnđ)', inp('rc_amount', r?r.amount:'', 'money', 'placeholder="VD: 1500000"'), true) +
    fld('Người thu', inp('rc_collector', r?r.collector:(currentUser?currentUser.name:''))) +
    fld('Ngày tạo', inp('rc_created', r?r.createdDate:today(), 'date')) +
    fld('Ngày thu', inp('rc_collect', r?r.collectDate:today(), 'date')) +
    '</div>' + fld('Ghi chú', '<textarea id="rc_note">'+esc(r?r.note:'')+'</textarea>') +
    '<div class="form-sec"><h3 class="sec">Đối tượng nộp tiền</h3><div class="fgrid">' +
    fld('Nhà', '<select id="rc_house" onchange="finHouseChange(\'rc\')">' + db.houses.map(function(x){
      return '<option value="'+x.id+'"'+(r && r.houseId===x.id ? ' selected' : '')+'>'+esc(x.name || x.address)+'</option>'; }).join('') + '</select>') +
    fld('Phòng', '<select id="rc_room" onchange="finRoomChange(\'rc\')">' + finRoomOptions(r ? r.houseId : '', r ? r.roomId : '') + '</select>') +
    fld('Khách thuê', '<select id="rc_cust"></select>') +
    fld('Người khác (nhập tên người nộp tự do — có giá trị thì dùng làm người nộp)', inp('rc_other', r && !payerIsCust ? (r.payer || '') : '')) +
    '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">'+(r ? 'Lưu khoản thu' : 'Thêm khoản thu')+'</button>' +
    '<button class="btn gray" type="button" onclick="finState.tab=\'thu\';go(\'finance\')">Quay lại</button></div></form>';
  setContent(h);
  finCustRefresh('rc', r && payerIsCust ? ct0.customerId : '');
}
function saveReceipt(id){
  var room = byId(db.rooms, val('rc_room'));
  var other = val('rc_other');
  var cust = byId(db.customers, val('rc_cust'));
  var payer = other || (cust ? cust.name : '');
  var ct = room ? activeContract(room.id) : null;
  var data = { title: val('rc_title'), amount: num(val('rc_amount')),
    houseId: room ? room.houseId : (val('rc_house') || null), roomId: val('rc_room') || null,
    contractCode: ct ? (ct.code || '') : '',
    createdDate: val('rc_created') || null, collectDate: val('rc_collect') || null,
    collector: val('rc_collector'), payer: payer, note: val('rc_note') };
  var pr = id ? updateRec('receipts', id, data) : createRec('receipts', data);
  pr.then(function(){ toast('Đã lưu khoản thu'); finState.tab='thu'; go('finance'); }).catch(errToast);
}
function viewExpenseForm(p){
  var e = p.id ? byId(db.expenses, p.id) : null;
  var ct0 = e && e.roomId ? activeContract(e.roomId) : null;
  var rcvIsCust = !!(e && ct0 && e.receiverName && e.receiverName === customerName(ct0.customerId));
  var h = pageTitle(e ? 'Sửa khoản chi' : 'Thêm khoản chi');
  h += finTabsHtml('chi');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveExpense(\''+(e?e.id:'')+'\')"><div class="fgrid">' +
    fld('Khoản chi', inp('ex_title', e?e.title:''), true) +
    fld('Số tiền chi (vnđ)', inp('ex_amount', e?e.amount:'', 'money', 'placeholder="VD: 500000"'), true) +
    fld('Người chi', inp('ex_spender', e?e.spender:(currentUser?currentUser.name:''))) +
    fld('Ngày tạo', inp('ex_date', e?e.date:today(), 'date')) +
    fld('Ngày chi', inp('ex_paydate', e?e.payDate:today(), 'date')) +
    '</div>' + fld('Ghi chú', '<textarea id="ex_note">'+esc(e?e.note:'')+'</textarea>') +
    '<div class="form-sec"><h3 class="sec">Đối tượng nhận tiền</h3>' +
    '<label class="radio-line"><input type="radio" name="ex_rcv" id="ex_rcv_tenant"'+(e && !rcvIsCust ? '' : ' checked')+'> Khách thuê</label>' +
    '<div class="fgrid">' +
    fld('Nhà', '<select id="ex_house" onchange="finHouseChange(\'ex\')">' + db.houses.map(function(x){
      return '<option value="'+x.id+'"'+(e && e.houseId===x.id ? ' selected' : '')+'>'+esc(x.name || x.address)+'</option>'; }).join('') + '</select>') +
    fld('Phòng', '<select id="ex_room" onchange="finRoomChange(\'ex\')">' + finRoomOptions(e ? e.houseId : '', e ? e.roomId : '') + '</select>') +
    fld('Khách thuê', '<select id="ex_cust"></select>') +
    '</div>' +
    '<label class="radio-line"><input type="radio" name="ex_rcv" id="ex_rcv_other"'+(e && !rcvIsCust ? ' checked' : '')+'> Người khác</label>' +
    '<div class="fgrid">' +
    fld('Tên', inp('ex_rcv_name', e && !rcvIsCust ? (e.receiverName || '') : '')) +
    fld('SDT', inp('ex_rcv_phone', e && !rcvIsCust ? (e.receiverPhone || '') : '')) +
    '</div></div>' +
    '<div class="btnrow"><button class="btn green" type="submit">'+(e ? 'Lưu khoản chi' : 'Thêm khoản chi')+'</button>' +
    '<button class="btn gray" type="button" onclick="finState.tab=\'chi\';go(\'finance\')">Quay lại</button></div></form>';
  setContent(h);
  finCustRefresh('ex', e && rcvIsCust ? ct0.customerId : '');
}
function saveExpense(id){
  var room = byId(db.rooms, val('ex_room'));
  var isTenant = isChk('ex_rcv_tenant');
  var cust = byId(db.customers, val('ex_cust'));
  var receiverName, receiverPhone;
  if(isTenant && cust){ receiverName = cust.name; receiverPhone = cust.phone || ''; }
  else { receiverName = val('ex_rcv_name'); receiverPhone = val('ex_rcv_phone'); }
  var ct = room ? activeContract(room.id) : null;
  var data = { title: val('ex_title'), amount: num(val('ex_amount')),
    houseId: room ? room.houseId : (val('ex_house') || null), roomId: val('ex_room') || null,
    contractCode: ct ? (ct.code || '') : '',
    date: val('ex_date') || null, payDate: val('ex_paydate') || null,
    spender: val('ex_spender'), receiverName: receiverName, receiverPhone: receiverPhone, note: val('ex_note') };
  var pr = id ? updateRec('expenses', id, data) : createRec('expenses', data);
  pr.then(function(){ toast('Đã lưu khoản chi'); finState.tab='chi'; go('finance'); }).catch(errToast);
}
VIEWS.finance = viewFinance; VIEWS.receiptForm = viewReceiptForm; VIEWS.expenseForm = viewExpenseForm;

/* ================================================================
   8) DỊCH VỤ
   ================================================================ */
function viewServices(){
  var h = pageTitle('Danh sách dịch vụ');
  /* Đợt 5 (mục 18): nút Thêm Dịch Vụ ở góc phải trên bảng; bảng gọn 4 cột + icon Sửa/Xóa */
  h += '<div class="btnrow" style="justify-content:flex-end"><button class="btn green" onclick="go(\'serviceForm\')">+ Thêm Dịch Vụ</button></div>';
  h += tableHtml(['STT','Tên Dịch Vụ','Giá Dịch Vụ (vnđ)','Đơn vị',''], db.services.map(function(s, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(s.name)+'</b></td><td class="price">'+fmtNum(s.price)+'</td><td>'+esc(unitName(s.unitId))+'</td>' +
      '<td class="act"><button class="linkbtn" title="Sửa" onclick="go(\'serviceForm\',{id:\''+s.id+'\'})">✎</button>' +
      '<button class="linkbtn red" title="Xóa" onclick="delBtn(\'Dịch vụ '+esc(s.name)+'\',\'services\',\''+s.id+'\')">🗑</button></td></tr>';
  }).join(''), 'Chưa có dịch vụ nào');
  setContent(h);
}
function viewServiceForm(p){
  var s = p.id ? byId(db.services, p.id) : null;
  var h = pageTitle(s ? 'Sửa dịch vụ' : 'Thêm dịch vụ');
  /* Đợt 5 (mục 19): form dịch vụ đúng 3 trường của ảnh; Giá là ô text */
  h += '<form class="form-card" onsubmit="event.preventDefault();saveService(\''+(s?s.id:'')+'\')"><div class="fgrid">' +
    fld('Tên dịch vụ', inp('sv_name', s?s.name:''), true) +
    fld('Giá dịch vụ (vnđ)', inp('sv_price', s?s.price:'', 'money', 'placeholder="VD: 3500"')) +
    fld('Đơn vị', selObj('sv_unit', db.units, s?s.unitId:'', function(u){ return u.name; }, '-- Chọn đơn vị --')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">'+(s ? 'Lưu thay đổi' : 'Thêm Dịch Vụ')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'services\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveService(id){
  if(!lockSave('service')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var data = { name: val('sv_name'), price: num(val('sv_price')), unitId: val('sv_unit') || null };
  var pr = id ? updateRec('services', id, data) : createRec('services', data);
  pr.then(function(){ toast('Đã lưu dịch vụ'); go('services'); unlockSave('service'); }).catch(function(e){ errToast(e); unlockSave('service'); });
}
VIEWS.services = viewServices; VIEWS.serviceForm = viewServiceForm;

/* ================================================================
   9) NHÂN VIÊN — DS | Phân chức vụ theo nhà | Chức vụ | Vai trò
   ================================================================ */
var staffState = { tab:'assign', rolePos:'' };
var PERM_MODULES = [['nha','Quản lý nhà'],['phong','Quản lý phòng'],['dichVu','Cấu hình dịch vụ'],['hopDong','Quản lý hợp đồng phòng'],['khachThue','Quản lý khách thuê'],['thuChi','Quản lý thu chi'],['thongBao','Quản lý thông báo']];
function assignmentsOf(accountId){ return db.staffAssignments.filter(function(a){ return a.accountId === accountId; }); }
function staffCell(a){
  return '<span style="font-size:17px">👤</span> ' + esc(a.name) + '(' + esc(a.phone || '') + ')';
}
function viewStaff(){
  var st = staffState;
  var h = pageTitle('Nhân viên');
  /* Đợt 5 (mục 20/21/23): đúng 3 tab con theo ảnh, theo thứ tự này */
  var tabs = [['assign','Phân chức vụ theo nhà'],['list','Danh sách nhân viên'],['roles','Phân chia vai trò theo chức vụ']];
  h += '<div class="tabs">' + tabs.map(function(t){
    return '<span class="tab'+(st.tab===t[0]?' on':'')+'" onclick="staffState.tab=\''+t[0]+'\';viewStaff()">'+t[1]+'</span>'; }).join('') + '</div>';
  if(st.tab === 'assign') h += staffAssignHtml();
  else if(st.tab === 'list') h += staffListHtml();
  else h += staffRolesHtml();
  setContent(h);
}
/* ----- Tab Phân chức vụ theo nhà: lọc 3 select + bảng GOM THEO NHÀ ----- */
var staffAssignF = {};
function staffAssignHtml(){
  var f = staffAssignF;
  var h = '<form class="filters" onsubmit="event.preventDefault();saveAssignment()">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('sa_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Nhân Viên</label>'+selObj('sa_acc', db.accounts, f.accountId||'', function(x){ return x.name + ' (' + (x.phone||'') + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Chức vụ</label>'+selObj('sa_pos', db.positions, f.positionId||'', function(x){ return x.name; }, 'Tất cả')+'</div>' +
    '<button class="btn green" type="submit">+ Gán chức vụ</button>' +
    '<button class="btn" type="button" onclick="staffAssignF={houseId:val(\'sa_house\'),accountId:val(\'sa_acc\'),positionId:val(\'sa_pos\')};viewStaff()">Lọc</button></form>';
  var rows = '', houseIdx = 0;
  db.houses.forEach(function(hs){
    var as = db.staffAssignments.filter(function(a){
      if(a.houseId !== hs.id) return false;
      if(f.houseId && a.houseId !== f.houseId) return false;
      if(f.accountId && a.accountId !== f.accountId) return false;
      if(f.positionId && a.positionId !== f.positionId) return false;
      return true;
    });
    if(!as.length) return;
    houseIdx++;
    as.forEach(function(a, j){
      var acc = byId(db.accounts, a.accountId);
      rows += '<tr>' + (j === 0 ? '<td rowspan="'+as.length+'">'+houseIdx+'</td><td rowspan="'+as.length+'"><b>'+esc(hs.name || hs.address)+'</b></td>' : '') +
        '<td>'+(acc ? staffCell(acc) : '')+'</td><td>'+esc(positionName(a.positionId))+'</td>' +
        '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Phân công này\',\'staffAssignments\',\''+a.id+'\',function(){viewStaff();})">Xóa</button></td></tr>';
    });
  });
  h += tableHtml(['STT','Nhà','Nhân Viên','Chức vụ',''], rows, 'Chưa có phân công nào khớp bộ lọc');
  return h;
}
function saveAssignment(){
  if(!val('sa_house') || !val('sa_acc') || !val('sa_pos')){ toast('Chọn đủ Nhà, Nhân viên và Chức vụ để gán'); return; }
  createRec('staffAssignments', { accountId: val('sa_acc'), houseId: val('sa_house'), positionId: val('sa_pos') })
    .then(function(){ toast('Đã gán chức vụ'); viewStaff(); }).catch(errToast);
}
/* ----- Tab Danh sách nhân viên: lọc 3 select + bảng GOM THEO NHÂN VIÊN ----- */
var staffF = {};
function staffListHtml(){
  var f = staffF;
  var h = '<div class="filters">' +
    '<div class="fg"><label>Nhà trọ</label>'+selObj('sf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Nhân Viên</label>'+selObj('sf_acc', db.accounts, f.accountId||'', function(x){ return x.name + ' (' + (x.phone||'') + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Chức vụ</label>'+selObj('sf_pos', db.positions, f.posId||'', function(x){ return x.name; }, 'Tất cả')+'</div>' +
    '<button class="btn" onclick="staffF={houseId:val(\'sf_house\'),accountId:val(\'sf_acc\'),posId:val(\'sf_pos\')};viewStaff()">Lọc</button></div>';
  h += '<div class="btnrow" style="justify-content:flex-end"><button class="btn green" onclick="go(\'staffForm\')">+ Thêm nhân viên</button></div>';
  var list = db.accounts.filter(function(a){
    var as = assignmentsOf(a.id);
    if(f.accountId && a.id !== f.accountId) return false;
    if(f.houseId && !as.some(function(x){ return x.houseId === f.houseId; })) return false;
    if(f.posId && !as.some(function(x){ return x.positionId === f.posId; })) return false;
    return true;
  });
  var rows = '';
  list.forEach(function(a, i){
    var as = assignmentsOf(a.id);
    if(f.houseId) as = as.filter(function(x){ return x.houseId === f.houseId; });
    if(f.posId) as = as.filter(function(x){ return x.positionId === f.posId; });
    /* Gom theo chức vụ: mỗi chức vụ 1 dòng con, cột Nhà liệt kê các nhà của chức vụ đó */
    var byPos = [], seen = {};
    as.forEach(function(x){
      if(!seen[x.positionId]){ seen[x.positionId] = { posId: x.positionId, houses: [] }; byPos.push(seen[x.positionId]); }
      var hn = houseName(x.houseId); if(hn && seen[x.positionId].houses.indexOf(hn) < 0) seen[x.positionId].houses.push(hn);
    });
    if(!byPos.length) byPos = [{ posId: '', houses: [] }];
    byPos.forEach(function(g, j){
      rows += '<tr>' + (j === 0 ? '<td rowspan="'+byPos.length+'">'+(i+1)+'</td><td rowspan="'+byPos.length+'">'+staffCell(a)+'</td>' : '') +
        '<td>'+esc(g.posId ? positionName(g.posId) : '—')+'</td><td>'+(g.houses.length ? g.houses.map(function(x){ return esc(x); }).join('<br>') : '—')+'</td>' +
        (j === 0 ? '<td class="act" rowspan="'+byPos.length+'"><button class="linkbtn" onclick="go(\'staffForm\',{id:\''+a.id+'\'})">Sửa</button>' +
        '<button class="linkbtn red" onclick="delBtn(\'Nhân viên '+esc(a.name)+'\',\'accounts\',\''+a.id+'\',function(){viewStaff();})">Xóa</button></td>' : '') + '</tr>';
    });
  });
  h += tableHtml(['STT','Nhân Viên','Chức vụ','Nhà',''], rows, 'Chưa có nhân viên nào');
  return h;
}
/* ----- Tab Phân chia vai trò theo chức vụ: bảng tóm tắt quyền + trình sửa ma trận ----- */
function permSummary(pos){
  var perms = (pos && pos.permissions) || {};
  var labels = [];
  if(perms.thongKe) labels.push('Xem thống kê/Báo cáo');
  var all = !!perms.thongKe;
  PERM_MODULES.forEach(function(m){
    var mp = perms[m[0]] || {};
    if(mp.add || mp.edit || mp.delete) labels.push(m[1]);
    if(!(mp.add && mp.edit && mp.delete)) all = false;
  });
  if(all) return 'Tất cả các quyền';
  return labels.length ? labels.join(', ') : 'Chưa cấu hình quyền';
}
function staffRolesHtml(){
  var h = tableHtml(['STT','Chức vụ','Vai Trò',''], db.positions.map(function(p2, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(p2.name)+'</b></td><td>'+esc(permSummary(p2))+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="staffState.rolePos=\''+p2.id+'\';viewStaff()">Sửa vai trò</button>' +
      '<button class="linkbtn" onclick="renamePosition(\''+p2.id+'\',\''+esc(p2.name)+'\')">Sửa tên</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Chức vụ '+esc(p2.name)+'\',\'positions\',\''+p2.id+'\',function(){viewStaff();})">Xóa</button></td></tr>';
  }).join(''), 'Chưa có chức vụ nào');
  /* Nút Thêm chức vụ đặt DƯỚI bảng (đúng ảnh) */
  h += '<div class="btnrow"><button class="btn green" onclick="openAddPosition()">+ Thêm chức vụ</button></div>';
  var cur = byId(db.positions, staffState.rolePos) || db.positions[0];
  /* Đợt 13: chọn chức vụ là ma trận quyền tự đổi theo (onchange), không còn
     nút "Xem ma trận quyền" — ma trận vẫn tự hiện ngay khi mở tab. */
  h += '<div class="filters"><div class="fg"><label>Chọn chức vụ để sửa ma trận quyền</label>' +
    selObj('role_pos', db.positions, cur ? cur.id : '', function(x){ return x.name; }, undefined, 'onchange="renderRoleMatrix()"') + '</div></div><div id="role_matrix"></div>';
  setTimeout(renderRoleMatrix, 0);
  return h;
}
function openAddPosition(){
  openModal('<h3>Thêm Chức vụ</h3><label class="fl">Chức vụ</label><input id="pos_name" placeholder="VD: Lễ tân">' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Hủy</button><button class="btn green" id="pos_add">Thêm Chức vụ</button></div>');
  document.getElementById('pos_add').onclick = function(){
    if(!val('pos_name')){ toast('Nhập tên chức vụ'); return; }
    createRec('positions', { name: val('pos_name'), permissions: { thongKe: false } })
      .then(function(){ closeModal(); toast('Đã thêm chức vụ'); viewStaff(); }).catch(errToast);
  };
}
function renamePosition(id, oldName){
  openModal('<h3>Sửa tên chức vụ</h3><label class="fl">Tên chức vụ</label><input id="pos_newname" value="'+esc(oldName)+'">' +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal()">Hủy</button><button class="btn" id="pos_save">Lưu</button></div>');
  document.getElementById('pos_save').onclick = function(){
    updateRec('positions', id, { name: val('pos_newname') }).then(function(){ closeModal(); toast('Đã đổi tên'); viewStaff(); }).catch(errToast);
  };
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
function locOptions(sourceArr, current){
  var vals = [];
  sourceArr.forEach(function(v){ if(v && vals.indexOf(v) < 0) vals.push(v); });
  if(current && vals.indexOf(current) < 0) vals.unshift(current);
  return [['', '-- Chọn --']].concat(vals.map(function(v){ return [v, v]; }));
}
function viewStaffForm(p){
  var a = p.id ? byId(db.accounts, p.id) : null;
  var h = pageTitle(a ? 'Sửa nhân viên' : 'Thêm nhân viên');
  /* Đợt 5 (mục 22): hồ sơ nhân viên đầy đủ như hồ sơ khách/chủ nhà, đúng thứ tự ảnh.
     Đợt 6 (điểm cộng mục 1): Tỉnh/Quận/Phường dùng chung select xếp tầng hành chính VN */
  h += '<form class="form-card" onsubmit="event.preventDefault();saveStaff(\''+(a?a.id:'')+'\')"><div class="fgrid">' +
    fld('Họ tên', inp('st_name', a?a.name:''), true) +
    avatarPhHtml() +
    fld('Ngày sinh', inp('st_dob', a?a.dob:'', 'date')) +
    fld('Tỉnh / thành phố', locSelectHtml('st', 'province')) +
    fld('Quận / Huyện', locSelectHtml('st', 'district')) +
    fld('Phường / Xã', locSelectHtml('st', 'ward')) +
    fld('Địa chỉ thường trú', inp('st_perm', a?a.permanentAddress:'')) +
    fld('SDT (dùng đăng nhập)', inp('st_phone', a?a.phone:''), true) +
    fld('Giới tính', sel('st_gender', ['Nam','Nữ','Khác'], a?a.gender:'Nam')) +
    fld('Nghề nghiệp', inp('st_job', a?a.job:'')) +
    fld('Tình trạng hôn nhân', inp('st_marital', a?a.maritalStatus:'')) +
    fld('Mail', inp('st_email', a?a.email:'')) +
    fld('CMND/CCCD', inp('st_idcard', a?a.idCard:'')) +
    cmndPhotosHtml() +
    fld('Vai trò đăng nhập', sel('st_role', [['staff','Nhân viên'],['admin','Quản trị viên']], a?a.role:'staff')) +
    (a ? '' : fld('Mật khẩu đăng nhập', inp('st_pw', '', 'password'))) +
    '</div><div class="btnrow"><button class="btn green" type="submit">'+(a ? 'Lưu thay đổi' : 'Thêm nhân viên')+'</button>' +
    '<button class="btn gray" type="button" onclick="go(\'staff\')">Quay lại</button></div></form>';
  if(a) h += '<p style="color:#757575;max-width:1080px">Đặt lại mật khẩu cho nhân viên này: dùng chức năng ở mục Quản lý → Cài đặt (admin) hoặc API đặt lại mật khẩu.</p>';
  setContent(h);
  /* Đợt 6: nạp select hành chính xếp tầng, chọn sẵn theo hồ sơ đã lưu */
  locInit('st', { province: a ? a.province : '', district: a ? a.district : '', ward: a ? a.ward : '' });
}
function saveStaff(id){
  if(!lockSave('staff')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var data = { name: val('st_name'), phone: val('st_phone'), role: val('st_role'),
    dob: val('st_dob') || null, gender: val('st_gender'), job: val('st_job'),
    maritalStatus: val('st_marital'), email: val('st_email'), idCard: val('st_idcard'),
    province: val('st_province'), district: val('st_district'), ward: val('st_ward'),
    permanentAddress: val('st_perm') };
  var pr;
  if(id) pr = updateRec('accounts', id, data);
  else { data.password = document.getElementById('st_pw').value || '123456'; data.modules = []; data.houseIds = []; pr = createRec('accounts', data); }
  pr.then(function(){ toast('Đã lưu nhân viên'); go('staff'); unlockSave('staff'); }).catch(function(e){ errToast(e); unlockSave('staff'); });
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
    /* Đợt 5 (mục 24): feed 2 cột ngày giờ/nội dung; Cài đặt thông báo ở góc phải trên */
    var h = '<div style="display:flex;align-items:center;justify-content:space-between;max-width:1080px">' +
      '<h2 class="page" style="margin-bottom:0">Thông báo</h2>' +
      '<button class="btn gray" onclick="openNotifSettings()">⚙ Cài đặt thông báo</button></div>';
    var items = (data.items || []).filter(function(n){ return settings[n.type] !== false; });
    h += '<div style="margin-top:14px">' + (items.length ? items.map(function(n){
      return '<div class="notif-item" style="display:flex;gap:16px;align-items:baseline"><div class="time" style="min-width:130px;white-space:nowrap">'+esc(fmtDT(n.time))+'</div><div>'+esc(n.content)+'</div></div>';
    }).join('') : '<div class="empty-note">Chưa có thông báo nào</div>') + '</div>';
    setContent(h);
  }).catch(errToast);
}
function openNotifSettings(){
  var settings = notifSettings();
  var h = '<h3 style="margin-top:0">Cài đặt thông báo</h3>' +
    NOTIF_TYPES.map(function(t){
      var on = settings[t[0]] !== false;
      return '<div class="switch"><span>'+t[1]+'</span><input type="checkbox" style="width:auto" '+(on?'checked':'')+' onchange="toggleNotif(\''+t[0]+'\', this.checked)"></div>';
    }).join('') +
    '<div class="btnrow"><button class="btn gray" onclick="closeModal();viewNotifications()">Đóng</button></div>';
  openModal(h);
}
function toggleNotif(type, on){
  var s = notifSettings(); s[type] = on;
  try { localStorage.setItem('nhatro_notify_settings', JSON.stringify(s)); } catch(e){}
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
    fld('Phí (vnđ)', inp('v_fee', v?v.fee:0, 'money')) +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'vehicles\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveVehicle(id){
  if(!lockSave('vehicle')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var room = byId(db.rooms, val('v_room'));
  var data = { houseId: room ? room.houseId : val('v_house'), roomId: val('v_room') || null,
    type: val('v_type'), plate: val('v_plate'), ownerName: val('v_owner'),
    brand: val('v_brand'), color: val('v_color'), fee: num(val('v_fee')) };
  var pr = id ? updateRec('vehicles', id, data) : createRec('vehicles', data);
  pr.then(function(){ toast('Đã lưu xe'); go('vehicles'); unlockSave('vehicle'); }).catch(function(e){ errToast(e); unlockSave('vehicle'); });
}
var assetFilter = {};
function assetOwnerLabel(a){
  var ow = a.owner || a.ownerType;  // ownerType: dữ liệu cũ trước đợt 19
  return ow === 'landlord' ? 'Chủ nhà' : (ow === 'room' ? 'Chủ đầu tư/Quản lý' : (ow || ''));
}
function viewAssets(){
  var f = assetFilter;
  /* Đợt 20: bộ lọc Nhà / Phòng / Chủ sở hữu + cột Chủ sở hữu trong bảng.
     Thống kê tính trên danh sách đã lọc để khớp với bảng đang xem. */
  var list = db.assets.filter(function(a){
    if(f.houseId && a.houseId !== f.houseId) return false;
    if(f.roomId && a.roomId !== f.roomId) return false;
    if(f.owner && (a.owner || a.ownerType) !== f.owner) return false;
    return true;
  });
  var counts = {};
  list.forEach(function(a){ counts[a.status] = (counts[a.status]||0) + 1; });
  var h = pageTitle('Tài sản');
  h += '<div class="grid-stats">' + ['Mới','Như mới','Tốt','Cũ','Hỏng','Mất'].map(function(s){
    return '<div class="stat"><div class="num">'+(counts[s]||0)+'</div><div class="lbl">'+s+'</div></div>'; }).join('') + '</div>';
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('asf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Phòng</label>'+selObj('asf_room', db.rooms, f.roomId||'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Chủ sở hữu</label>'+sel('asf_owner', [['','Tất cả'],['room','Chủ đầu tư/Quản lý'],['landlord','Chủ nhà']], f.owner||'')+'</div>' +
    '<button class="btn" onclick="assetFilter={houseId:val(\'asf_house\'),roomId:val(\'asf_room\'),owner:val(\'asf_owner\')};viewAssets()">Lọc</button>' +
    '<button class="btn gray" onclick="assetFilter={};viewAssets()">Bỏ lọc</button></div>';
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'assetForm\')">+ Thêm tài sản</button></div>';
  h += tableHtml(['STT','Nhà','Phòng','Mã TS','Loại tài sản','Trạng thái','Chủ sở hữu','Ảnh',''], list.map(function(a, i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(houseName(a.houseId))+'</td><td>'+esc(roomName(a.roomId))+'</td><td>'+esc(a.code)+'</td><td><b>'+esc(a.type)+'</b></td><td>'+esc(a.status)+'</td><td>'+esc(assetOwnerLabel(a))+'</td>' +
      /* Đợt 6 (mục 2): thumbnail ảnh tài sản đã tải lên */
      '<td>'+(a.imageUrl ? '<img class="asset-thumb-sm" src="'+esc(a.imageUrl)+'" alt="Ảnh tài sản">' : '')+'</td>' +
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
    /* Đợt 18: đổi tên hiển thị 'Đối tượng' -> 'Chủ sở hữu', giữ nguyên giá trị
       room/landlord nên dữ liệu cũ và nơi hiển thị (nhà/phòng) không đổi:
       Chủ đầu tư/Quản lý = tài sản trong phòng cũ, Chủ nhà = tài sản chủ nhà cũ. */
    fld('Chủ sở hữu', sel('a_owner', [['room','Chủ đầu tư/Quản lý'],['landlord','Chủ nhà']], a?a.owner:'room')) +
    fld('Phòng', selObj('a_room', db.rooms, a?a.roomId:'', function(x){ return x.name + ' (' + houseName(x.houseId) + ')'; }, '-- Cả nhà --')) +
    fld('Mã tài sản (để trống = tự sinh)', inp('a_code', a?a.code:'')) + fld('Loại tài sản', inp('a_type', a?a.type:''), true) +
    fld('Trạng thái', sel('a_status', ASSET_STATUSES, a?a.status:'Tốt')) +
    fld('Note', inp('a_note', a?a.note:'')) +
    /* Đợt 6 (mục 2): ảnh tài sản tải lên thật — cùng bộ chọn ảnh với form nhà */
    imagePickerHtml('a_img', a ? (a.imageUrl || '') : '', 'Ảnh tài sản') +
    '</div><div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'assets\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveAsset(id){
  var room = byId(db.rooms, val('a_room'));
  var data = { houseId: room ? room.houseId : val('a_house'), roomId: val('a_room') || null,
    code: val('a_code'), owner: val('a_owner'), type: val('a_type'), status: val('a_status'),
    note: val('a_note'), imageUrl: val('a_img') };
  var pr = id ? updateRec('assets', id, data) : createRec('assets', data);
  pr.then(function(){ toast('Đã lưu tài sản'); go('assets'); }).catch(errToast);
}
var incFilter = {};
var INC_STATUSES = ['Chưa sửa','Tiếp nhận sự cố','Đang sửa','Đã sửa'];
function incBadge(s){ return s==='Đã sửa' ? '<span class="badge b-done">Đã sửa</span>' : (s==='Đang sửa' ? '<span class="badge b-fixing">Đang sửa</span>' : (s==='Tiếp nhận sự cố' ? '<span class="badge b-received">Tiếp nhận sự cố</span>' : '<span class="badge b-new">Chưa sửa</span>')); }
function viewIncidents(){
  var f = incFilter;
  var h = pageTitle('Sự cố');
  h += '<div class="filters">' +
    '<div class="fg"><label>Nhà</label>'+selObj('icf_house', db.houses, f.houseId||'', function(x){ return (x.name||x.address); }, 'Tất cả')+'</div>' +
    '<div class="fg"><label>Loại</label>'+sel('icf_type', [['','Tất cả'],['Hỏng điện','Hỏng điện'],['Hỏng nước','Hỏng nước'],['Hỏng mạng','Hỏng mạng'],['Khác','Khác']], f.type||'')+'</div>' +
    '<div class="fg"><label>Trạng thái</label><div>'+INC_STATUSES.map(function(st,i){ return chk('icf_st_'+i, st, (f.statuses||[]).indexOf(st)>=0); }).join('')+'</div></div>' +
    '<button class="btn" onclick="incFilter={houseId:val(\'icf_house\'),type:val(\'icf_type\'),statuses:INC_STATUSES.filter(function(st,i){ return isChk(\'icf_st_\'+i); })};viewIncidents()">Lọc</button>' +
    '<button class="btn gray" onclick="incFilter={};viewIncidents()">Bỏ lọc</button>' +
    '<button class="btn green" onclick="go(\'incidentForm\')">+ Thêm sự cố</button></div>';
  /* Đợt 21: lọc Trạng thái bằng checkbox chọn nhiều: tích trạng thái nào
     thì hiện sự cố ở trạng thái đó; không tích gì = tất cả (như 'Tất cả'
     trước đây). f.status cũ (chuỗi) vẫn được hiểu để tương thích. */
  var incSts = f.statuses || (f.status ? [f.status] : []);
  var list = db.incidents.filter(function(x){
    if(f.houseId && x.houseId !== f.houseId) return false;
    if(f.type && x.type !== f.type) return false;
    if(incSts.length && incSts.indexOf(x.status) < 0) return false;
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
    '<button class="btn green" type="submit">+ Thêm đơn vị</button></form>';
  h += tableHtml(['STT','Tên đơn vị',''], db.units.map(function(u, i){
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(u.name)+'</b></td>' +
      '<td class="act"><button class="linkbtn red" onclick="delBtn(\'Đơn vị '+esc(u.name)+'\',\'units\',\''+u.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có đơn vị nào');
  setContent(h);
}
function saveUnit(){
  if(!val('un_name')){ toast('Nhập tên đơn vị'); return; }
  if(!lockSave('unit')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  createRec('units', { name: val('un_name') }).then(function(){ toast('Đã thêm đơn vị'); go('units'); unlockSave('unit'); }).catch(function(e){ errToast(e); unlockSave('unit'); });
}
function viewCustomers(){
  var h = pageTitle('Khách thuê');
  h += '<div class="btnrow"><button class="btn green" onclick="go(\'customerForm\')">+ Thêm khách</button></div>';
  h += tableHtml(['STT','Họ tên','SDT','Giới tính','Ngày sinh','Nghề nghiệp','Email','CMND','Địa chỉ thường trú','Phòng đang ở',''], db.customers.map(function(c, i){
    var ct = db.contracts.filter(function(x){ return x.customerId === c.id && x.status === 'active'; })[0];
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(c.name)+'</b></td><td>'+esc(c.phone)+'</td><td>'+esc(c.gender)+'</td><td>'+fmtDate(c.dob)+'</td><td>'+esc(c.job||'')+'</td><td>'+esc(c.email||'')+'</td><td>'+esc(c.idCard||'')+'</td><td>'+esc(c.permanentAddress||'')+'</td><td>'+(ct ? esc(roomName(ct.roomId)) : '—')+'</td>' +
      '<td class="act"><button class="linkbtn" onclick="go(\'customerForm\',{id:\''+c.id+'\'})">Sửa</button>' +
      '<button class="linkbtn red" onclick="delBtn(\'Khách '+esc(c.name)+'\',\'customers\',\''+c.id+'\')">Xóa</button></td></tr>';
  }).join(''), 'Chưa có khách nào');
  setContent(h);
}
function viewCustomerForm(p){
  var c = p.id ? byId(db.customers, p.id) : null;
  var h = pageTitle(c ? 'Sửa khách thuê' : 'Thêm khách thuê');
  h += '<form class="form-card" onsubmit="event.preventDefault();saveCustomer(\''+(c?c.id:'')+'\')">' +
    custFieldsHtml('cm', c || {}) +
    '<div class="btnrow"><button class="btn green" type="submit">Lưu</button>' +
    '<button class="btn gray" type="button" onclick="go(\'customers\')">Quay lại</button></div></form>';
  setContent(h);
}
function saveCustomer(id){
  if(!lockSave('customer')) return;  // Đợt 25: bấm Lưu liên tục chỉ chạy 1 lần lưu
  var data = collectCust('cm');
  var pr = id ? updateRec('customers', id, data) : createRec('customers', data);
  pr.then(function(){ toast('Đã lưu khách'); go('customers'); unlockSave('customer'); }).catch(function(e){ errToast(e); unlockSave('customer'); });
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
    /* Đợt 14: đã gỡ hẳn chức năng "Xóa dữ liệu & nạp lại dữ liệu mẫu" khỏi
       Cài đặt vì rủi ro bấm nhầm làm mất toàn bộ dữ liệu thật. */
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
