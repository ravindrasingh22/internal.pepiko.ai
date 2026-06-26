let usersState = {users: [], roles: [], tab: 'users'};

function canManageInternalUsers(){return user?.role === 'super_admin'}
function userInitials(name='', email=''){const source=name||email||'IU'; return esc(source.split(/[ .@_-]+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase())}
function userActions(u){
  if(!canManageInternalUsers())return '<span class="small muted">Read only</span>';
  const activeAction = u.is_active
    ? `<button class="btn sm danger" type="button" aria-label="Disable ${esc(u.email)}" onclick="toggleInternalUser(${u.id},false)">Disable</button>`
    : `<button class="btn sm primary" type="button" aria-label="Enable ${esc(u.email)}" onclick="toggleInternalUser(${u.id},true)">Enable</button>`;
  const deleteAction = u.id === user?.id ? '<span class="small muted">Current user</span>' : `<button class="btn sm danger" type="button" aria-label="Delete ${esc(u.email)}" onclick='deleteInternalUser(${u.id},${JSON.stringify(u.email)})'>Delete</button>`;
  return `<button class="btn sm" type="button" aria-label="Edit ${esc(u.email)}" onclick='openInternalUserForm(${JSON.stringify(u).replaceAll("'","&#039;")})'>Edit</button> ${activeAction} <button class="btn sm" type="button" aria-label="Reset password for ${esc(u.email)}" onclick='openPasswordReset(${u.id},${JSON.stringify(u.email)})'>Reset Password</button> ${deleteAction}`;
}

async function users(tab='users'){
  usersState.tab = tab;
  head('Users & Roles','Manage internal portal users, roles, access status and password resets.',canManageInternalUsers()?'<button class="btn primary" onclick="openInternalUserForm()">Add Internal User</button>':'');
  const d = await api('/api/internal/users');
  usersState = {users: d.users || [], roles: d.roles || [], tab};
  $('#content').innerHTML = `<div class="panel"><div class="tabs"><button class="tab ${tab==='users'?'active':''}" type="button" onclick="users('users')">Users</button><button class="tab ${tab==='permissions'?'active':''}" type="button" onclick="users('permissions')">Permissions</button></div>${tab==='permissions'?permissionsTab():usersTab()}</div>`;
}

function usersTab(){
  const rows = usersState.users;
  const roles = usersState.roles;
  return `<div class="grid kpi-grid">${roles.map(r=>`<div class="kpi-card"><div class="kpi-icon">♙</div><div><div class="kpi-title">${esc(r.label)}</div><div class="kpi-value">${rows.filter(u=>u.role===r.role).length}</div><div class="kpi-delta">${esc(r.role)}</div></div></div>`).join('')}</div><div style="margin-top:18px;overflow:auto">${table(['User','Role','Status','Last login','Created','Actions'],rows.map(u=>[
    `<div style="display:flex;align-items:center;gap:12px;min-width:260px"><div class="avatar" style="width:34px;height:34px;font-size:12px">${userInitials(u.name,u.email)}</div><div><strong>${esc(u.name)}</strong><div class="small muted">${esc(u.email)}</div></div></div>`,
    badge(u.role),
    u.is_active ? badge('active') : badge('disabled'),
    date(u.last_login_at),
    date(u.created_at),
    userActions(u)
  ]))}</div>`;
}

function permissionsTab(){
  return `${table(['Role','Description','Permissions'],usersState.roles.map(r=>[badge(r.role),esc(r.description),esc((r.permissions||[]).join(', '))]))}<p class="small muted">Only super admins can create internal users, change roles, disable users, or reset passwords. Ops admins can view this page and customer operations context.</p>`;
}

async function internalRoleOptions(selected='support_agent'){
  const roles = usersState.roles.length ? usersState.roles : (await api('/api/internal/users')).roles || [];
  return roles.map(r=>`<option value="${esc(r.role)}" ${r.role===selected?'selected':''}>${esc(r.label)} (${esc(r.role)})</option>`).join('');
}

async function openInternalUserForm(u=null){
  if(!canManageInternalUsers())return setStatus('Only super admins can manage internal users.','error');
  let options='';
  try{options=await internalRoleOptions(u?.role||'support_agent')}catch{options=['super_admin','ops_admin','billing_manager','support_agent'].map(r=>`<option value="${r}" ${r===u?.role?'selected':''}>${r}</option>`).join('')}
  $('#modal').className='modal';
  $('#modal').innerHTML=`<div class="modal-card user-form-modal"><div class="modal-titlebar"><div><div class="eyebrow">Internal access</div><h2>${u?'Edit internal user':'Add internal user'}</h2><p>${u?'Update role, status, and optional password reset for this internal portal user.':'Create a new internal portal user and assign their operating role.'}</p></div><button class="btn" onclick="closeModal()">Close</button></div><div class="user-form-card"><div id="userFormError" class="portal-alert warning form-error" role="alert"></div><div class="user-form-section"><div class="section-title"><h3>Profile</h3><p>Name and sign-in identity for the internal portal.</p></div><div class="form-grid two-col"><label class="form-field">Full name<input id="iu_name" autocomplete="name" placeholder="Jane Operations" value="${esc(u?.name||'')}"></label><label class="form-field">Email address<input id="iu_email" type="email" autocomplete="email" placeholder="jane@pepiko.ai" ${u?'disabled':''} value="${esc(u?.email||'')}"></label></div></div><div class="user-form-section"><div class="section-title"><h3>Access</h3><p>Choose what this user can do and whether their account is active.</p></div><div class="form-grid two-col"><label class="form-field">Role<select id="iu_role">${options}</select></label><label class="form-field">Account status<select id="iu_active"><option value="true" ${u?.is_active!==false?'selected':''}>Active</option><option value="false" ${u?.is_active===false?'selected':''}>Disabled</option></select></label></div></div><div class="user-form-section"><div class="section-title"><h3>${u?'Password reset':'Initial password'}</h3><p>${u?'Leave blank to keep the current password unchanged.':'Set the first password for this internal user.'}</p></div><label class="form-field">Password<input id="iu_password" type="password" autocomplete="new-password" placeholder="${u?'Optional new password':'Initial password'}" value="${u?'':'password123'}"></label></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveInternalUser(${u?.id||0})">${u?'Save user':'Create user'}</button></div></div>`;
}

async function saveInternalUser(id){
  if(!canManageInternalUsers())return setStatus('Only super admins can manage internal users.','error');
  const payload={name:iu_name.value.trim(),role:iu_role.value,is_active:iu_active.value==='true'};
  if(!payload.name)return setFormError('Name is required for internal users.',iu_name,'userFormError');
  if(!id){payload.email=iu_email.value.trim().toLowerCase(); if(!payload.email||!payload.email.includes('@'))return setFormError('A valid email is required for internal users.',iu_email,'userFormError')}
  if(iu_password.value)payload.password=iu_password.value;
  await api(id?`/api/internal/users/${id}`:'/api/internal/users',{method:id?'PUT':'POST',successMessage:id?'Internal user access updated.':'Internal user created and can now sign in.',body:JSON.stringify(payload)});
  closeModal();
  await users('users');
}

async function toggleInternalUser(id,isActive){
  if(!canManageInternalUsers())return setStatus('Only super admins can enable or disable internal users.','error');
  await api(`/api/internal/users/${id}`,{method:'PUT',successMessage:isActive?'Internal user enabled. They can sign in again.':'Internal user disabled. They can no longer sign in.',body:JSON.stringify({is_active:isActive})});
  await users('users');
}

function openPasswordReset(id,email){
  if(!canManageInternalUsers())return setStatus('Only super admins can reset internal user passwords.','error');
  $('#modal').className='modal';
  $('#modal').innerHTML=`<div class="modal-card"><div class="panel-head"><h2>Reset Password</h2><button class="btn" onclick="closeModal()">Close</button></div><p class="muted">Set a new password for ${esc(email)}.</p><div class="form-grid"><div id="passwordFormError" class="portal-alert warning form-error" role="alert"></div><label>New password<input id="iu_reset_password" type="password" value="password123"></label><button class="btn primary" onclick="resetInternalPassword(${id})">Reset Password</button></div></div>`;
}

async function resetInternalPassword(id){
  if(!canManageInternalUsers())return setStatus('Only super admins can reset internal user passwords.','error');
  if(!iu_reset_password.value)return setFormError('Password is required before resetting access.',iu_reset_password,'passwordFormError');
  await api(`/api/internal/users/${id}/reset-password`,{method:'POST',successMessage:'Internal user password reset. Share the new password through a secure channel.',body:JSON.stringify({password:iu_reset_password.value})});
  closeModal();
  await users('users');
}

async function deleteInternalUser(id,email){
  if(!canManageInternalUsers())return setStatus('Only super admins can delete internal users.','error');
  if(id===user?.id)return setStatus('You cannot delete your own internal account.','warning');
  if(!confirm(`Delete internal user ${email}? This removes their internal portal access permanently.`))return;
  await api(`/api/internal/users/${id}`,{method:'DELETE',successMessage:`Internal user ${email} was deleted and can no longer access the internal portal.`});
  await users('users');
}
