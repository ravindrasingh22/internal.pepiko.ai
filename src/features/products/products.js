async function products(){
  head('Products Management','Configure Pepiko API products, absolute endpoint URL, request contract, authentication, pricing, model version and lifecycle status.','<button class="btn primary" onclick="openProductForm()">New Product</button>');
  const rows=await api('/api/internal/products');
  $('#content').innerHTML=`<div class="panel">${table(['Code','Name','Category','Endpoint','Auth','Model','Status','Actions'],rows.map(p=>[
    esc(p.product_code),
    esc(p.name),
    esc(p.category),
    `<span class="mono">${esc(absoluteEndpoint(p.endpoint_path))}</span>`,
    badge(productAuthType(p)),
    esc(p.model_version),
    badge(productStatus(p)),
    productActions(p)
  ]))}</div>`;
}

function productAuthType(p){return p?.config_json?.auth_type||'x_api_key_header'}
function productRequestBody(p){return p?.config_json?.request_body_schema||{product_code:p?.product_code||'child_safety_classifier',environment:'production',text:'Sample input text'}}
function absoluteEndpoint(value){return String(value||'').trim()}
function productStatus(p){return p?.status==='published'?'published':'unpublished'}
function productActions(p){const data=JSON.stringify(p).replaceAll("'","&#039;");const toggle=productStatus(p)==='published'?`<button class="btn sm" onclick="unpublishProduct(${p.id})">Unpublish</button>`:`<button class="btn sm" onclick="publishProduct(${p.id})">Publish</button>`;return `<button class="btn sm" onclick='openProductForm(${data})'>Edit</button> ${toggle} <button class="btn sm" onclick="deleteProduct(${p.id})">Delete</button>`}

function openProductForm(p=null){
  const cfg=p?.config_json||{};
  const requestBody=JSON.stringify(productRequestBody(p),null,2);
  $('#modal').className='modal';
  $('#modal').innerHTML=`<div class="modal-card"><div class="panel-head"><h2>${p?'Edit':'Create'} Product</h2><button class="btn" onclick="closeModal()">Close</button></div><div class="form-grid"><div id="productFormError" class="portal-alert warning form-error" role="alert"></div><label>Product code<input id="pr_code" ${p?'disabled':''} value="${esc(p?.product_code||'new_product')}"></label><label>Name<input id="pr_name" value="${esc(p?.name||'New Product')}"></label><label>Category<input id="pr_cat" value="${esc(p?.category||'guardrail')}"></label><label>Description<textarea id="pr_desc">${esc(p?.description||'')}</textarea></label><label>Status<select id="pr_status"><option value="unpublished">unpublished</option><option value="published">published</option></select></label><label>Complete absolute endpoint URL<input id="pr_endpoint" required placeholder="https://api.pepiko.ai/api/public/v1/classify" value="${esc(absoluteEndpoint(p?.endpoint_path))}"></label><label>Authentication type<select id="pr_auth"><option value="x_api_key_header">X-API-Key header</option><option value="bearer_token">Bearer token</option><option value="basic_auth">Basic auth</option><option value="none">None</option></select></label><label>Request body JSON<textarea id="pr_body" class="mono">${esc(requestBody)}</textarea></label><label>Model version<input id="pr_model" value="${esc(p?.model_version||'v1.0')}"></label><label>Base credits<input id="pr_base" type="number" step="0.0001" value="${p?.base_credits||1}"></label><label>Input token rate<input id="pr_input" type="number" step="0.0001" value="${p?.input_token_rate||0.001}"></label><label>Output token rate<input id="pr_output" type="number" step="0.0001" value="${p?.output_token_rate||0.002}"></label><label>Multiplier<input id="pr_mult" type="number" step="0.0001" value="${p?.product_multiplier||1}"></label><label>Rate limit/min<input id="pr_limit" type="number" value="${p?.request_limit_per_minute||1000}"></label><button class="btn primary" onclick="saveProduct(${p?.id||0})">Save Product</button></div></div>`;
  if(p){pr_status.value=productStatus(p)}
  pr_auth.value=cfg.auth_type||'x_api_key_header';
}

async function saveProduct(id){
  const endpoint=pr_endpoint.value.trim();
  if(!endpoint)return setFormError('Endpoint URL is required.',pr_endpoint,'productFormError');
  if(!/^https?:\/\//.test(endpoint))return setFormError('Endpoint URL must start with http:// or https://.',pr_endpoint,'productFormError');
  let requestBody;
  try{requestBody=JSON.parse(pr_body.value)}catch{return setFormError('Request body must be valid JSON.',pr_body,'productFormError')}
  const payload={product_code:pr_code.value,name:pr_name.value,category:pr_cat.value,description:pr_desc.value,status:pr_status.value,publish_status:pr_status.value,endpoint_path:endpoint,model_version:pr_model.value,base_credits:Number(pr_base.value),input_token_rate:Number(pr_input.value),output_token_rate:Number(pr_output.value),product_multiplier:Number(pr_mult.value),request_limit_per_minute:Number(pr_limit.value),is_public:pr_status.value==='published',docs_url:null,config_json:{auth_type:pr_auth.value,request_body_schema:requestBody,redact_payloads:true}};
  await api(id?`/api/internal/products/${id}`:'/api/internal/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
  closeModal();
  await products();
}

async function publishProduct(id){await api(`/api/internal/products/${id}/publish`,{method:'POST'}); await products()}
async function unpublishProduct(id){if(!confirm('Unpublish this product? It will be hidden from customer API Playground navigation.'))return;await api(`/api/internal/products/${id}/unpublish`,{method:'POST'});await products()}
async function deleteProduct(id){if(!confirm('Delete this product configuration?'))return;await api(`/api/internal/products/${id}`,{method:'DELETE'});await products()}
