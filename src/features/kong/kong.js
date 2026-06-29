const KONG_ENVS=['development','staging','production'];
const runtimeRoles={settings:['super_admin'],ops:['super_admin','ops_admin'],support:['super_admin','ops_admin','support_agent'],billing:['super_admin','ops_admin','billing_manager']};
function canRuntime(roleGroup='ops'){return (runtimeRoles[roleGroup]||runtimeRoles.ops).includes(user?.role)}
function runtimeEmpty(title,detail){return `<div class="panel empty"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`}
function kongStatusCard(label,value,detail=''){return `<div class="kpi-card"><div class="kpi-icon">●</div><div><div class="kpi-title">${esc(label)}</div><div class="kpi-value" style="font-size:20px">${badge(value||'unknown')}</div>${detail?`<div class="kpi-delta">${esc(detail)}</div>`:''}</div></div>`}
function secretLabel(setting){return setting?.secret_configured?'Configured':'Not configured'}
function envSetting(settings,env){return (settings||[]).find(s=>s.environment===env)||{environment:env,status:'unknown',auth_type:'header_token',header_name:'Kong-Admin-Token',timeout_ms:5000,retry_count:2,health_check_path:'/status',enabled:false}}

async function kongSettings(){
  head('Kong Settings','Configure core-service access to Kong Admin API per environment. Secrets stay in the backend and are never returned to the browser.',canRuntime('settings')?'<button class="btn" onclick="testAllKongConnections()">Test All</button> <button class="btn primary" onclick="openKongSettingsForm()">Configure Environment</button>':'');
  const settings=await apiOptional('/api/internal/kong/settings',[]);
  const rows=KONG_ENVS.map(env=>envSetting(settings,env));
  $('#content').innerHTML=`<div class="kpi-grid">${rows.map(s=>kongStatusCard(s.environment,s.status,`${secretLabel(s)}${s.last_error?' - '+s.last_error:''}`)).join('')}</div><div class="panel" style="margin-top:18px">${table(['Environment','Admin API','Auth','Secret','Timeout','Health path','Enabled','Last checked','Last error','Actions'],rows.map(s=>[
    esc(s.environment),
    `<span class="mono">${esc(s.admin_api_base_url||'Not configured')}</span>`,
    esc(s.auth_type||s.auth_mode||'-'),
    secretLabel(s),
    Number(s.timeout_ms||5000)+'ms',
    esc(s.health_check_path||'/status'),
    s.enabled===false?badge('disabled'):badge('enabled'),
    date(s.last_checked_at),
    s.last_error?`<span class="mono">${esc(s.last_error)}</span>`:'-',
    `<button class="btn sm" onclick='openKongSettingsForm(${JSON.stringify(s).replaceAll("'","&#039;")})'>Edit</button> <button class="btn sm" onclick="testKongConnection('${esc(s.environment)}')">Test</button>`
  ]))}</div>`;
  if(!settings.length)setStatus('Kong Admin API settings endpoint is not available yet. The UI contract is ready and will use /api/internal/kong/settings when core service implements it.','warning');
}

function openKongSettingsForm(s=null){
  if(!canRuntime('settings'))return setStatus('Only super admin users can update Kong Admin API settings.','error');
  const env=s?.environment||'development';
  $('#modal').className='modal';
  $('#modal').innerHTML=`<div class="modal-card user-form-modal"><div class="modal-titlebar"><div><div class="eyebrow">Runtime gateway</div><h2>Kong Admin API settings</h2><p>These settings are submitted to platform-core-service. The browser never calls Kong Admin API directly.</p></div><button class="btn" onclick="closeModal()">Close</button></div><div class="user-form-card"><div id="kongSettingsFormError" class="portal-alert warning form-error" role="alert"></div><div class="user-form-section"><div class="section-title"><h3>Environment</h3><p>Choose which runtime gateway environment this connection controls.</p></div><div class="form-grid two-col"><label class="form-field">Environment<select id="ks_env">${KONG_ENVS.map(x=>`<option>${x}</option>`).join('')}</select></label><label class="form-field">Enabled<select id="ks_enabled"><option value="true">enabled</option><option value="false">disabled</option></select></label></div></div><div class="user-form-section"><div class="section-title"><h3>Connection</h3><p>Core service validates and stores this connection. Secrets are redacted in responses.</p></div><div class="form-grid two-col"><label class="form-field">Admin API base URL<input id="ks_url" placeholder="http://kong-admin:8001" value="${esc(s?.admin_api_base_url||'')}"></label><label class="form-field">Health check path<input id="ks_health" value="${esc(s?.health_check_path||'/status')}"></label><label class="form-field">Timeout ms<input id="ks_timeout" type="number" value="${Number(s?.timeout_ms||5000)}"></label><label class="form-field">Retry count<input id="ks_retry" type="number" value="${Number(s?.retry_count||2)}"></label></div></div><div class="user-form-section"><div class="section-title"><h3>Authentication</h3><p>Use a secret reference or value accepted by core service. Existing secrets are not shown.</p></div><div class="form-grid two-col"><label class="form-field">Authentication type<select id="ks_auth"><option value="none">none</option><option value="header_token">header token</option><option value="basic">basic</option><option value="mtls">mTLS</option></select></label><label class="form-field">Header name<input id="ks_header" value="${esc(s?.header_name||'Kong-Admin-Token')}"></label><label class="form-field">Secret reference<input id="ks_secret" placeholder="${s?.secret_configured?'Configured - leave blank to keep current secret':'vault path or encrypted secret'}"></label></div></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveKongSettings()">Save Settings</button></div></div>`;
  ks_env.value=env; ks_auth.value=s?.auth_type||s?.auth_mode||'header_token'; ks_enabled.value=String(s?.enabled!==false);
}

async function saveKongSettings(){
  const endpoint=ks_url.value.trim();
  if(!endpoint)return setFormError('Kong Admin API base URL is required.',ks_url,'kongSettingsFormError');
  if(!/^https?:\/\//.test(endpoint))return setFormError('Admin API base URL must start with http:// or https://.',ks_url,'kongSettingsFormError');
  const payload={environment:ks_env.value,admin_api_base_url:endpoint,auth_type:ks_auth.value,header_name:ks_header.value.trim()||null,secret_ref:ks_secret.value.trim()||null,timeout_ms:Number(ks_timeout.value)||5000,retry_count:Number(ks_retry.value)||2,health_check_path:ks_health.value.trim()||'/status',enabled:ks_enabled.value==='true'};
  await api(`/api/internal/kong/settings/${encodeURIComponent(ks_env.value)}`,{method:'PATCH',successMessage:`Kong Admin API settings saved for ${ks_env.value}. Secret values remain backend-only.`,body:JSON.stringify(payload)});
  closeModal(); await kongSettings();
}

async function testKongConnection(env){
  const result=await api(`/api/internal/kong/settings/${encodeURIComponent(env)}/test`,{method:'POST',successMessage:`Kong Admin API connection test completed for ${env}.`});
  const test=result.test||{};
  if(test.status==='connected')setStatus(`Kong Admin API ${env} is reachable. HTTP ${test.http_status}.`,'success');
  else setStatus(`Kong Admin API ${env} is not reachable: ${test.error||'health check failed'}`,'error');
  await kongSettings();
}

async function testAllKongConnections(){
  for(const env of KONG_ENVS){
    const setting=envSetting(await apiOptional('/api/internal/kong/settings',[]),env);
    if(setting.admin_api_base_url)await testKongConnection(env);
  }
}

async function kongDrift(){
  head('Kong Drift','Detect and repair mismatches between Pepiko DB source-of-truth and Kong runtime gateway.','<button class="btn" onclick="kongDrift()">Refresh</button> <button class="btn primary" onclick="fixAllKongDrift()">Bulk Fix</button>');
  const data=await apiOptional('/api/internal/kong/drift',{items:[]});
  const items=data.items||data||[];
  $('#content').innerHTML=`<div class="panel">${table(['Severity','Customer','Resource','Drift','DB State','Kong State','Detected','Action'],items.map(d=>[
    badge(d.severity||'warning'),
    esc(d.customer_name||d.tenant_slug||d.organization_slug||'-'),
    esc(d.resource_type||'-'),
    esc(d.drift_type||d.type||'-'),
    `<span class="mono">${esc(JSON.stringify(d.db_state||d.expected||{}))}</span>`,
    `<span class="mono">${esc(JSON.stringify(d.kong_state||d.actual||{}))}</span>`,
    date(d.detected_at||d.created_at),
    `<button class="btn sm" onclick="fixKongDrift('${esc(d.id)}')">Fix</button>`
  ]))}</div>${!items.length?runtimeEmpty('No drift data available','Core service should expose GET /api/internal/kong/drift. When implemented, this table will show DB/Kong mismatches and safe fix actions.'):''}`;
}

async function fixKongDrift(id){
  if(!canRuntime('ops'))return setStatus('Only operations admins can fix Kong drift.','error');
  if(!confirm('Fix this Kong drift item through core service?'))return;
  await api(`/api/internal/kong/drift/${encodeURIComponent(id)}/fix`,{method:'POST',successMessage:'Kong drift item fixed through platform-core-service.'});
  await kongDrift();
}

async function fixAllKongDrift(){
  if(!canRuntime('ops'))return setStatus('Only operations admins can bulk fix Kong drift.','error');
  if(!confirm('Bulk fix Kong drift items? This will apply safe runtime sync actions through core service.'))return;
  await api('/api/internal/kong/drift/bulk-fix',{method:'POST',successMessage:'Bulk Kong drift repair started through platform-core-service.'});
  await kongDrift();
}

async function runtimeAnalytics(){
  head('Runtime Analytics','Kong runtime usage after ingestion into Pepiko analytics. The browser reads normalized core-service data only.','');
  const summary=await apiOptional('/api/internal/analytics/runtime/summary',{summary:{},by_customer:[],by_api:[],errors:[],rate_limits:[]});
  const byCustomer=summary.by_customer||await apiOptional('/api/internal/analytics/runtime/by-customer',[]);
  const byApi=summary.by_api||await apiOptional('/api/internal/analytics/runtime/by-api',[]);
  const errors=summary.errors||await apiOptional('/api/internal/analytics/runtime/errors',[]);
  $('#content').innerHTML=`<div class="kpi-grid"><div class="kpi-card"><div class="kpi-icon">◷</div><div><div class="kpi-title">Requests</div><div class="kpi-value">${money(summary.summary?.requests||summary.requests||0)}</div></div></div><div class="kpi-card"><div class="kpi-icon">!</div><div><div class="kpi-title">401 / 403 / 429</div><div class="kpi-value" style="font-size:22px">${money(summary.summary?.auth_errors||0)}</div></div></div><div class="kpi-card"><div class="kpi-icon">ms</div><div><div class="kpi-title">p95 latency</div><div class="kpi-value" style="font-size:22px">${money(summary.summary?.p95_latency_ms||0)}ms</div></div></div><div class="kpi-card"><div class="kpi-icon">●</div><div><div class="kpi-title">Rate limited</div><div class="kpi-value" style="font-size:22px">${money(summary.summary?.rate_limited||0)}</div></div></div></div><div class="split" style="margin-top:18px"><div class="panel"><h2>By customer</h2>${table(['Customer','Requests','2xx','4xx','5xx','p95','Quota'],byCustomer.map(x=>[esc(x.customer_name||x.slug||x.customer_org_id),money(x.requests),money(x.success||x.status_2xx),money(x.client_errors||x.status_4xx),money(x.server_errors||x.status_5xx),`${money(x.p95_latency_ms)}ms`,badge(x.quota_status||'ok')]))}</div><div class="panel"><h2>By API product</h2>${table(['Product','Requests','Success','Errors','p95'],byApi.map(x=>[esc(x.product_code||x.api_product),money(x.requests),money(x.success),money(x.errors),`${money(x.p95_latency_ms)}ms`]))}<h2 style="margin-top:24px">Errors</h2>${table(['Type','Status','Count'],errors.map(x=>[esc(x.error_type||'-'),x.status_code||'-',money(x.count)]))}</div></div>`;
}

async function runtimeAudit(){
  head('Runtime Audit','Kong/runtime-impacting internal actions with actor, customer, resource, and timestamp.','');
  const rows=await apiOptional('/api/internal/audit/runtime',[]);
  $('#content').innerHTML=`<div class="panel">${table(['Actor','Action','Customer','Resource','Reason','Time'],rows.map(a=>[esc(a.actor_email||a.actor||'-'),esc(a.action),a.customer_org_id||a.tenant_id||'-',esc(a.resource_type||'-'),esc(a.reason||'-'),date(a.created_at)]))}</div>${!rows.length?runtimeEmpty('No runtime audit rows available','Core service should expose GET /api/internal/audit/runtime. Runtime operations must never include raw API keys or Kong Admin secrets in audit payloads.'):''}`;
}

async function loadCustomerRuntime(orgId){
  return await apiOptional(`/api/internal/customers/${orgId}/runtime`,{kong_consumer:{sync_status:'unknown'},api_keys:{active_in_db:0,active_in_kong:0,drift:false},access:{items:[],sync_status:'unknown'},limits:{sync_status:'unknown'}});
}

function renderCustomerRuntimeTab(org,runtime){
  const consumer=runtime.kong_consumer||runtime.consumer||{};
  const diagnostics=runtime.diagnostics||[];
  const diagnosticBox=diagnostics.length?`<div class="portal-alert ${diagnostics.some(d=>d.severity==='error')?'error':'warning'}" role="alert"><strong>Runtime sync needs attention</strong><ul>${diagnostics.map(d=>`<li>${esc(d.message||d.code||'Runtime sync issue')}</li>`).join('')}</ul></div>`:'';
  return `<div id="runtimeTab" class="custTab hidden"><div class="kpi-grid">${kongStatusCard('Consumer sync',consumer.sync_status||runtime.kong_sync_status,consumer.username||`tenant_${org.slug}`)}${kongStatusCard('Runtime keys',runtime.api_keys?.drift?'drifted':'synced',`${runtime.api_keys?.active_in_db||0} DB / ${runtime.api_keys?.active_in_kong||0} Kong`)}${kongStatusCard('Access sync',runtime.access?.sync_status||'unknown','Product ACL groups')}${kongStatusCard('Limit sync',runtime.limits?.sync_status||'unknown','Rate limiting plugin')}</div>${diagnosticBox}<div class="split" style="margin-top:18px"><div class="panel"><div class="panel-head"><h2>Kong Consumer</h2><button class="btn sm" onclick="syncCustomerConsumer(${org.id})">Sync Consumer</button></div>${table(['Field','Value'],[['Username',`<span class="mono">${esc(consumer.username||`tenant_${org.slug}`)}</span>`],['Custom ID',esc(consumer.custom_id||String(org.id))],['Kong ID',esc(consumer.id||consumer.kong_consumer_id||'-')],['Last synced',date(consumer.last_synced_at||runtime.kong_last_synced_at)],['Status',badge(consumer.sync_status||runtime.kong_sync_status||'unknown')],['Last error',esc(runtime.kong_error||'-')]])}</div><div class="panel"><div class="panel-head"><h2>Runtime actions</h2><button class="btn primary sm" onclick="syncAllCustomerRuntime(${org.id})">Sync All</button></div><div class="filters-row"><button class="btn" onclick="syncCustomerAccess(${org.id})">Sync API Access</button><button class="btn" onclick="syncCustomerLimits(${org.id})">Sync Limits</button><button class="btn danger" onclick="suspendCustomerRuntime(${org.id})">Suspend Runtime</button><button class="btn primary" onclick="restoreCustomerRuntime(${org.id})">Restore Runtime</button></div><p class="small muted">Sync All creates the Kong consumer and reconciles visible sync state. Active API keys without a Kong credential id must be rotated because the raw key is not stored.</p></div></div></div>`;
}

function renderCustomerAccessTab(org,runtime,products=[]){
  const accessItems=runtime.access?.items||runtime.product_access||[];
  const productRows=(accessItems.length?accessItems:products.map(p=>({product_code:p.product_code,name:p.name,status:'unknown',kong_acl_group:p.config_json?.kong_acl_group||`api_${p.product_code}`})));
  return `<div id="apiAccessTab" class="custTab hidden"><div class="panel"><div class="panel-head"><h2>Product API access</h2><button class="btn sm" onclick="saveCustomerAccess(${org.id})">Save Access</button></div>${table(['Enabled','Product','ACL group','Environments','Sync'],productRows.map((p,i)=>[
    `<input type="checkbox" class="access-toggle" data-product="${esc(p.product_code)}" ${['enabled','active','true'].includes(String(p.status||p.enabled).toLowerCase())?'checked':''}>`,
    esc(p.name||p.product_code),
    `<input class="filter-input mono access-group" data-product="${esc(p.product_code)}" value="${esc(p.kong_acl_group||p.acl_group||`api_${p.product_code}`)}">`,
    esc((p.environments||p.allowed_environments||['production']).join(', ')),
    badge(p.kong_sync_status||p.sync_status||'unknown')
  ]))}</div></div>`;
}

function renderCustomerLimitsTab(org,runtime){
  const limits=runtime.limits||{};
  return `<div id="limitsTab" class="custTab hidden"><div class="split"><div class="panel"><h2>Rate limits</h2><div class="form-grid two-col"><label class="form-field">Plan code<input id="rt_plan_code" value="${esc(limits.plan_code||org.plan_code||'growth')}"></label><label class="form-field">Minute limit<input id="rt_minute" type="number" value="${Number(limits.minute||limits.minute_limit||1000)}"></label><label class="form-field">Hourly limit<input id="rt_hour" type="number" value="${Number(limits.hour||limits.hour_limit||0)}"></label><label class="form-field">Daily limit<input id="rt_day" type="number" value="${Number(limits.day||limits.daily_limit||10000)}"></label><label class="form-field">Monthly limit<input id="rt_month" type="number" value="${Number(limits.month||limits.monthly_limit||0)}"></label><label class="form-field">Hard block<select id="rt_hard_block"><option value="true">enabled</option><option value="false">disabled</option></select></label></div><div class="filters-row" style="margin-top:16px"><button class="btn primary" onclick="saveCustomerLimits(${org.id})">Save Limits</button><button class="btn" onclick="syncCustomerLimits(${org.id})">Sync Kong</button></div></div><div class="panel"><h2>Runtime limit state</h2>${table(['Field','Value'],[['Sync status',badge(limits.sync_status||'unknown')],['Plugin ID',esc(limits.kong_plugin_id||'-')],['Last synced',date(limits.last_synced_at)],['Drift',limits.drift?badge('drifted'):badge('synced')]])}</div></div></div>`;
}

async function syncCustomerConsumer(orgId){await api(`/api/internal/customers/${orgId}/runtime/sync-consumer`,{method:'POST',successMessage:'Kong Consumer synced for this customer organization.'});await customerDetail(orgId)}
async function syncAllCustomerRuntime(orgId){await api(`/api/internal/customers/${orgId}/runtime/sync-all`,{method:'POST',successMessage:'Customer runtime Consumer, keys, access, and limits sync started.'});await customerDetail(orgId)}
async function suspendCustomerRuntime(orgId){const reason=prompt('Reason for runtime suspension?','Internal operational hold');if(!reason)return;await api(`/api/internal/customers/${orgId}/runtime/suspend`,{method:'POST',successMessage:'Customer runtime suspended. Active Kong credentials were removed or disabled.',body:JSON.stringify({reason})});await customerDetail(orgId)}
async function restoreCustomerRuntime(orgId){if(!confirm('Restore runtime access? Existing revoked API keys will not be reactivated.'))return;await api(`/api/internal/customers/${orgId}/runtime/restore`,{method:'POST',successMessage:'Customer runtime restored. Customer must create new API keys if previous keys were revoked.'});await customerDetail(orgId)}
async function syncCustomerAccess(orgId){await api(`/api/internal/customers/${orgId}/api-access/sync-kong`,{method:'POST',successMessage:'Customer product access synced to Kong ACL groups.'});await customerDetail(orgId)}
async function saveCustomerAccess(orgId){const products=$$('.access-toggle').map(x=>({product_code:x.dataset.product,enabled:x.checked,kong_acl_group:($(`.access-group[data-product="${CSS.escape(x.dataset.product)}"]`)||{}).value||`api_${x.dataset.product}`}));await api(`/api/internal/customers/${orgId}/api-access`,{method:'PATCH',successMessage:'Customer product API access saved and queued for runtime sync.',body:JSON.stringify({products})});await customerDetail(orgId)}
async function saveCustomerLimits(orgId){const payload={plan_code:rt_plan_code.value,minute:Number(rt_minute.value)||null,hour:Number(rt_hour.value)||null,day:Number(rt_day.value)||null,month:Number(rt_month.value)||null,hard_block:rt_hard_block.value==='true'};await api(`/api/internal/customers/${orgId}/limits`,{method:'PATCH',successMessage:'Customer runtime limits saved. Sync to Kong completed or was queued by core service.',body:JSON.stringify(payload)});await customerDetail(orgId)}
async function syncCustomerLimits(orgId){await api(`/api/internal/customers/${orgId}/limits/sync-kong`,{method:'POST',successMessage:'Customer rate limits synced to Kong runtime gateway.'});await customerDetail(orgId)}
