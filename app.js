// === SUPABASE SETUP ===
const supabase = window.supabase.createClient(
  "https://gfrvurvfqeurjlpyfbvl.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmcnZ1cnZmcWV1cmpscHlmYnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTQ1NDksImV4cCI6MjA2Njg3MDU0OX0.01wmeTXF51N0Dd5VBTZOWuOEje8qtutHUDm1ty0PtlE"
);

let isAdmin = false;

async function checkIfAdmin(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Admin check failed:', error);
    return false;
  }

  isAdmin = data?.is_admin || false;
  return isAdmin;
}

async function afterLogin() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user.id;
  await checkIfAdmin(userId);
}



// === GLOBAL STATE ===
let allProducts = [], allCategories = [], allBrands = [], currentUser = null, currentProfile = null;

// --- AUTH MODALS & PROFILE ---
function handleLoginProfile() {
  if (currentUser && currentProfile?.is_admin) openAdminDashboard();
  else if (currentUser) openProfileModal();
  else openLoginModal();
}
function openLoginModal() { document.getElementById("loginModal").classList.remove("hidden"); }
function closeLoginModal() { document.getElementById("loginModal").classList.add("hidden"); }
function openSignupModal() { document.getElementById("signupModal").classList.remove("hidden"); }
function closeSignupModal() { document.getElementById("signupModal").classList.add("hidden"); }

function openProfileModal() {
  document.getElementById("profileModal").classList.remove("hidden");
  if (currentProfile) {
    const f = document.getElementById("profileForm");
    f.name.value = currentProfile.name || "";
    f.email.value = currentProfile.email || "";
    f.phone.value = currentProfile.phone || "";
    f.address.value = currentProfile.address || "";
    document.getElementById("profilePhoto").src = currentProfile.photo_url || "https://placehold.co/80x80?text=Photo";

    // ✅ Corrected function call to load order history
    loadOrderHistory();
  }
}
function closeProfileModal() { document.getElementById("profileModal").classList.add("hidden"); }
document.getElementById("signupForm").onsubmit = async function(event) {
  event.preventDefault();
  let name = this.name.value.trim(), email = this.email.value.trim(), password = this.password.value, phone = this.phone.value.trim(), address = this.address.value.trim();
  const msg = document.getElementById("signupMsg");
  msg.textContent = "";
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin+"/verify.html" }});
  if (error) { msg.textContent = "Signup failed: "+error.message; msg.style.color = "red"; return;}
  if (data.user && data.user.id) await supabase.from("profiles").upsert([{ id: data.user.id, email, name, phone, address }]);
  msg.textContent = "✅ Signup successful! Please verify your email.";
  msg.style.color = "green";
  setTimeout(() => closeSignupModal(), 2500);
};
document.getElementById("loginForm").onsubmit = async function(event) {
  event.preventDefault();
  document.getElementById("loginError").textContent = "";
  const email = this.email.value.trim(), password = this.password.value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (data && data.session) {
    currentUser = data.user;             // ✅ First set currentUser
    await afterLogin();                  // ✅ Then check admin flag
    await loadCurrentProfile();          // ✅ Then load profile
    document.getElementById("loginText").textContent = currentProfile?.is_admin ? "Admin" : "Profile";
    closeLoginModal();
    alert("Logged in!");
  } else if (error) {
    document.getElementById("loginError").textContent = error.message;
  }
};

  currentUser = data.user;

  // ✅ TEST buyer RLS
  const { data: orderTest, error: orderTestError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', currentUser.id);

  if (orderTestError) {
    console.error("❌ RLS blocked order fetch:", orderTestError);
  } else {
    console.log("✅ RLS working — orders fetched:", orderTest);
  }

  document.getElementById("loginText").textContent = currentProfile?.is_admin ? "Admin" : "Profile";
  closeLoginModal();
  await loadCurrentProfile();
  alert("Logged in!");
};

async function loadCurrentProfile() {
  if (!currentUser) { currentProfile = null; return; }
  const { data } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
  currentProfile = data || {};
  document.getElementById("loginText").textContent = currentProfile?.is_admin ? "Admin" : "Profile";
}
document.getElementById("profileForm").onsubmit = async function(event) {
  event.preventDefault();
  let name = this.name.value.trim(), email = this.email.value.trim(), phone = this.phone.value.trim(), address = this.address.value.trim();
  const msg = document.getElementById("profileMsg");
  msg.textContent = "";
  await supabase.from("profiles").update({ name, email, phone, address }).eq("id", currentUser.id);
  msg.textContent = "✅ Profile updated!";
  msg.style.color = "green";
  await loadCurrentProfile();
  if (currentUser.email !== email) {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) { msg.textContent += " (Email update failed: "+error.message+")"; msg.style.color = "red"; }
  }
};
async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  document.getElementById("loginText").textContent = "Login";
  closeProfileModal();
  alert("Logged out!");
}
async function checkSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session && data.session.user) {
    currentUser = data.session.user;
    await loadCurrentProfile();
  } else document.getElementById("loginText").textContent = "Login";
}

// --- PROFILE PHOTO UPLOAD ---
document.getElementById("photoInput").onchange = async function(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;
  const filePath = `profile_photos/${currentUser.id}/${Date.now()}_${file.name}`;
  let { error } = await supabase.storage.from("profilephotos").upload(filePath, file, { upsert: true });
  if (error) return alert("Photo upload failed: " + error.message);
  const { data } = supabase.storage.from("profilephotos").getPublicUrl(filePath);
  if (data && data.publicUrl) {
    document.getElementById("profilePhoto").src = data.publicUrl;
    await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("id", currentUser.id);
    await loadCurrentProfile();
  }
};


// === Part 13: Buyer Order History ===

async function loadOrderHistory() {
  const user = await supabase.auth.getUser();
  if (!user || !user.data || !user.data.user) {
    document.getElementById('orderHistory').innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400">Please log in to view your order history.</p>';
    return;
  }
  const userId = user.data.user.id;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching order history:', error);
    document.getElementById('orderHistory').innerHTML = '<p class="text-center text-red-500">Error loading order history.</p>';
    return;
  }

  const orderHistoryDiv = document.getElementById('orderHistory');
  orderHistoryDiv.innerHTML = '';

  if (!orders.length) {
    orderHistoryDiv.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400">No orders found.</p>';
    return;
  }

  for (const order of orders) {
    let orderItemsHtml = '';
    let orderTotalCalculated = 0;

    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        const product = {
          name: item.name || 'Unnamed Product',
          image_url: item.image_url || 'https://placehold.co/80x80?text=No+Image',
          price: item.price || 0
        };

        const quantity = item.qty || item.quantity || 1;
        const itemPrice = product.price * quantity;
        orderTotalCalculated += itemPrice;

        orderItemsHtml += `
          <div class="flex items-center gap-3 py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
            <img src="${product.image_url}" alt="${product.name}" class="w-16 h-16 object-cover rounded-md">
            <div class="flex-1">
              <p class="font-semibold text-sm">${product.name}</p>
              <p class="text-xs text-gray-600 dark:text-gray-400">Qty: ${quantity} x ₹${product.price.toFixed(2)}</p>
            </div>
            <span class="font-bold text-sm">₹${itemPrice.toFixed(2)}</span>
          </div>
        `;
      }
    }

    orderHistoryDiv.innerHTML += `
      <div class="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow-sm mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="font-bold text-blue-700 dark:text-blue-300">Order ID: ${order.order_id || order.id.substring(0, 8) + '...'}</span>
          <span class="text-sm text-gray-600 dark:text-gray-400">${new Date(order.created_at).toLocaleDateString()}</span>
        </div>
        <div class="space-y-2">
          ${orderItemsHtml || '<p class="text-center text-gray-500">No items in this order.</p>'}
        </div>
        <div class="flex justify-between items-center mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
          <span class="font-bold text-lg">Total:</span>
          <span class="font-bold text-lg">₹${order.grand_total ? order.grand_total.toFixed(2) : orderTotalCalculated.toFixed(2)}</span>
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-400 mt-2">
          <p>Status: <span class="font-semibold text-green-600">${order.status || 'Pending'}</span></p>
          <p>Payment: <span class="font-semibold">${order.payment_method || 'N/A'}</span></p>
        </div>
      </div>
    `;
  }
}

// --- ADMIN DASHBOARD ---
function openAdminDashboard() {
  document.getElementById("adminDashboardModal").classList.remove("hidden");
  showAdminTab('orders');
}
function closeAdminDashboard() { document.getElementById("adminDashboardModal").classList.add("hidden"); }
async function showAdminTab(tab) {
  const container = document.getElementById("adminTabContent");
  if (tab === "orders") {
  if (!isAdmin) {
    container.innerHTML = "<p class='text-red-500'>❌ Access denied. Admin only.</p>";
    return;
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, profiles(name,email,phone)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("❌ Admin order fetch failed:", error);
    container.innerHTML = "<p class='text-red-500'>Failed to load orders.</p>";
    return;
  }
    container.innerHTML = orders.map(order => `
      <div class="order-card">
        <b>Order #${order.order_id}</b> | User: ${order.profiles?.name || '-'} (${order.profiles?.email || ''})
        <div>Status: 
          <select onchange="updateOrderStatus('${order.id}',this.value)">
            <option${order.status=='Pending'?' selected':''}>Pending</option>
            <option${order.status=='Completed'?' selected':''}>Completed</option>
            <option${order.status=='Cancelled'?' selected':''}>Cancelled</option>
          </select>
        </div>
        <div>Total: ₹${order.grand_total}</div>
        <div>Items:<ul>${order.items.map(i => `<li>${i.name} x${i.qty} – ₹${i.price}</li>`).join('')}</ul></div>
      </div>
    `).join('');
  }
  if (tab === "products") {
    const { data: products } = await supabase.from('daily2kartdata').select('*').order('created_at', { ascending: false });
    container.innerHTML = products.map(p => `
      <div class="order-card">
        <b>${p.name}</b> (${p.category}) - ₹${p.price}
        <div>Stock: ${p.stock || "N/A"}</div>
        <button onclick="editProduct('${p.id}')">Edit</button>
        <button onclick="deleteProduct('${p.id}')">Delete</button>
      </div>
    `).join('');
  }
  if (tab === "users") {
    const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    container.innerHTML = users.map(u => `
      <div class="order-card">
        <img src="${u.photo_url || 'https://placehold.co/40x40?text=Photo'}" alt="Profile photo of ${u.name || 'user'}" style="width:40px;height:40px;border-radius:50%;vertical-align:middle;margin-right:9px;">
        <b>${u.name}</b> (${u.email})<br>Phone: ${u.phone}<br>Admin: ${u.is_admin ? "✅" : ""}
      </div>
    `).join('');
  }
}
async function updateOrderStatus(orderId, status) {
  await supabase.from('orders').update({ status }).eq('id', orderId);
  showAdminTab('orders');
}

// --- BRAND NAV ---
async function loadBrands() {
  const { data: brands } = await supabase.from("brands").select("brandname");
  allBrands = brands || [];
  renderBrandDropdown();
}
function renderBrandDropdown() {
  const dropdown = document.getElementById("brandDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = allBrands.map(b =>
    `<a href="#" onclick="filterByBrand('${b.brandname}');return false;" class="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-pink-100 dark:hover:bg-blue-900">${b.brandname}</a>`
  ).join('');
}
function toggleBrandDropdown() { document.getElementById("brandDropdown").classList.toggle("hidden"); }
function filterByBrand(brand) {
  const container = document.getElementById("categoriesContainer");
  const filtered = allProducts.filter(p => p.brandname === brand);
  container.innerHTML = `
    <h2 class="text-xl md:text-2xl font-bold mb-3 text-pink-600">Brand: ${brand}</h2>
    <div class="flex flex-wrap gap-6">
      ${filtered.length ? filtered.map(renderProductCard).join('') : '<div class="text-gray-500 px-6 py-8">No products for this brand.</div>'}
    </div>
  `;
  feather.replace();
  document.getElementById("brandDropdown").classList.add("hidden");
}

// --- PRODUCTS & CATEGORIES ---
async function loadProducts() {
  const { data: products } = await supabase.from("daily2kartdata").select("*").order("created_at", { ascending: false });
  allProducts = products || [];
  renderCategories();
  applyFilters();
}
function renderCategories() {
  allCategories = [...new Set(allProducts.map(p => (p.category?.trim() || "Uncategorized")))];
  const container = document.getElementById("categoriesContainer");
  container.innerHTML = '';
  allCategories.forEach(cat => {
    const catProducts = allProducts.filter(p => (p.category?.trim() || "Uncategorized") === cat);
    container.innerHTML += `
      <section class="mb-10">
        <h2 class="text-xl md:text-2xl font-bold mb-3 text-pink-600 flex items-center gap-2">
          <i data-feather="folder"></i> ${cat}
        </h2>
        <div class="category-tramline flex gap-6 overflow-x-auto pb-3">
          ${catProducts.map(renderProductCard).join('')}
        </div>
      </section>
    `;
  });
  feather.replace();
}
function renderProductCard(p) {
  let gstRate = 0;
  if (typeof p.igst === 'number' && p.igst > 0) gstRate = p.igst;
  else if (typeof p.cgst === 'number' && typeof p.sgst === 'number') gstRate = p.cgst + p.sgst;
  const priceWithGst = (Number(p.price) + (Number(p.price) * gstRate / 100)).toFixed(2);
  const discount = p.mrp && p.mrp > 0 ? (((p.mrp - p.price) / p.mrp) * 100).toFixed(0) : 0;
  return `
    <div class="product-card min-w-[230px] max-w-[240px] flex-shrink-0">
      <img src="${p.image_url || 'https://placehold.co/220x160?text=No+Image'}" alt="${p.name || 'Product image'}" />
      <h3>${p.name}</h3>
      <div class="itemsize">${p.itemsize || ''}</div>
      <div class="price-line">
        <span class="font-semibold text-lg text-blue-700 dark:text-blue-300">₹${priceWithGst} <span class="text-xs text-gray-500">(incl. GST)</span></span><br>
        <span class="text-sm text-gray-500">Base: ₹${p.price}</span>
        <span class="mrp">₹${p.mrp || ''}</span>
        ${discount > 0 ? `<span class="discount-badge">${discount}% OFF</span>` : ''}
      </div>
      <div class="flex gap-3 mt-3">
        <button class="action-btn add-btn" onclick='addToCart(${JSON.stringify(p)})' title="Add to cart" aria-label="Add to cart">
          <i data-feather="shopping-cart"></i> Add to Cart
        </button>
        <button class="action-btn buy-btn" onclick='buyNow(${JSON.stringify(p)})' title="Buy Now" aria-label="Buy Now">
          <i data-feather="zap"></i> Buy Now
        </button>
      </div>
    </div>
  `;
}
function applyFilters() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) { renderCategories(); return; }
  const filtered = allProducts.filter(
    p => (p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query) ||
          p.brandname?.toLowerCase().includes(query))
  );
  const container = document.getElementById("categoriesContainer");
  container.innerHTML = `
    <h2 class="text-xl md:text-2xl font-bold mb-3 text-pink-600">Results</h2>
    <div class="flex flex-wrap gap-6">
      ${filtered.length ? filtered.map(renderProductCard).join('') : '<div class="text-gray-500 px-6 py-8">No products found.</div>'}
    </div>
  `;
  feather.replace();
}

// --- CART/ORDER CHECKOUT ---
function addToCart(product) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  const idx = cart.findIndex(p => p.id === product.id);
  if (idx !== -1) cart[idx].qty += 1;
  else cart.push({ ...product, qty: 1 });
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  showToast("🛒 Added to cart!", "success");
}
function buyNow(product) { addToCart(product); openCart(); }
function openCart() { renderCart(); document.getElementById("cartDrawer").classList.remove("hidden"); }
function closeCart(e) { if (!e || e.target === e.currentTarget) document.getElementById("cartDrawer").classList.add("hidden"); }
function renderCart() {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  const itemsDiv = document.getElementById("cartItems");
  let subtotal = 0;

  const itemHTML = cart.length
    ? cart.map((p, i) => {
        let gstRate = 0;
        if (typeof p.igst === 'number' && p.igst > 0) gstRate = p.igst;
        else if (typeof p.cgst === 'number' && typeof p.sgst === 'number') gstRate = p.cgst + p.sgst;

        const priceWithGst = Number(p.price) + (Number(p.price) * gstRate / 100);
        subtotal += priceWithGst * p.qty;

        return `
          <div class="flex items-center gap-3 mb-4 border-b pb-3">
            <img src="${p.image_url || 'https://placehold.co/80x80?text=No+Image'}" alt="${p.name}" class="w-16 h-16 object-contain rounded" />
            <div class="flex-1">
              <div class="font-bold">${p.name}</div>
              <div class="text-xs text-gray-500">${p.itemsize || ''}</div>
              <div class="text-sm">₹${priceWithGst.toFixed(2)} <span class="text-xs text-gray-400">(incl. GST)</span></div>
              <div class="flex gap-2 mt-1">
              <button class="cart-qty-btn" onclick="updateQty(${i},-1)">–</button>
              <span>${p.qty}</span>
              <button class="cart-qty-btn" onclick="updateQty(${i},1)">+</button>
              <button class="cart-remove-btn ml-2" onclick="removeCartItem(${i})" title="Remove"><i data-feather="trash-2"></i></button>
              </div>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="text-gray-500 py-12 text-center">Your cart is empty.</div>';

  // Summary Calculations
  let discount = subtotal > 1499 ? 50 : 0;
  let bonus = parseFloat(document.getElementById("bonus")?.value) || 0;
  let couponCode = document.getElementById("coupon_code")?.value.trim().toUpperCase() || "";
  let coupon = 0;
  if (couponCode === "SAVE50") coupon = 50;
  else if (couponCode === "WELCOME100") coupon = 100;

  let cgst = +(subtotal * 0.025).toFixed(2);
  let sgst = +(subtotal * 0.025).toFixed(2);
  let delivery = subtotal >= 999 ? 0 : 40;
  let grandTotal = subtotal - discount - bonus - coupon + cgst + sgst + delivery;

  const summaryHTML = cart.length ? `
    <div id="orderSummary" class="mt-6 text-sm border-t border-gray-300 pt-4 space-y-1">
      <div class="flex justify-between"><span>Subtotal:</span> <span id="summarySubtotal">₹${subtotal.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Discount:</span> <span id="summaryDiscount">– ₹${discount.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Bonus:</span> <span id="summaryBonus">– ₹${bonus.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Coupon:</span> <span id="summaryCoupon">– ₹${coupon.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>CGST:</span> <span id="summaryCgst">+ ₹${cgst.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>SGST:</span> <span id="summarySgst">+ ₹${sgst.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Delivery:</span> <span id="summaryDelivery">+ ₹${delivery.toFixed(2)}</span></div>
      <hr class="my-2 border-gray-400">
      <div class="flex justify-between font-bold text-lg"><span>Grand Total:</span> <span id="summaryGrandTotal">₹${grandTotal.toFixed(2)}</span></div>
    </div>
  ` : '';

  itemsDiv.innerHTML = itemHTML + summaryHTML;
  document.getElementById("cartTotal").textContent = grandTotal.toFixed(2);
  feather.replace();
}

function updateQty(idx, change) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  cart[idx].qty += change;
  if (cart[idx].qty <= 0) cart.splice(idx,1);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
  updateCartCount();
}
function removeCartItem(idx) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  cart.splice(idx,1);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
  updateCartCount();
}
function updateCartCount() {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  let total = cart.reduce((sum,p) => sum + p.qty, 0);
  document.getElementById("cartCount").textContent = total;
}
function updateWishlistCount() {
  document.getElementById("wishlistCount").textContent = 0;
}

// --- CHECKOUT FLOW ---
function showCheckoutModal() {
  document.getElementById("checkoutModal").classList.remove("hidden");
  if (currentProfile) {
    document.getElementById("buyer_name").value = currentProfile.name || "";
    document.getElementById("buyer_phone").value = currentProfile.phone || "";
    document.getElementById("buyer_address").value = currentProfile.address || "";
  }
}
function closeCheckoutModal() { document.getElementById("checkoutModal").classList.add("hidden"); }

/**
 * Autofill city/state by pincode (for pincode_data with bigint pincode)
 * Requires that the input pincode is converted to number before querying.
 */
async function fetchCityState(e) {
  const pin = e.target.value;
  if (!/^\d{6}$/.test(pin)) return;
  // Convert input pin to number for bigint DB match
  const pinNumber = Number(pin);

  const { data, error } = await supabase
    .from('pincode_data')
    .select('city_name, state_name')
    .eq('pincode', pinNumber)
    .maybeSingle();

  // Optionally log for debugging
  // console.log("Pin:", pin, "DB result:", data, "Error:", error);

  document.getElementById("buyer_city").value = data?.city_name || '';
  document.getElementById("buyer_state").value = data?.state_name || '';
}

// --- ORDER PROCESS place  ---
  async function checkout(mode = 'prepaid') {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  if (!cart.length) return alert('Cart is empty!');

  const f = document.getElementById("checkoutForm");
  const bonus = parseFloat(f.bonus.value) || 0;
  const couponCode = f.coupon_code.value.trim() || "";
  let coupon = 0;  // future: apply coupon discount logic here
   if (couponCode.toUpperCase() === "SAVE50") {
   coupon = 50;
} else if (couponCode.toUpperCase() === "WELCOME100") {
  coupon = 100;
}

  if (!f.buyer_name.value || !f.buyer_phone.value || !f.buyer_address.value || !f.buyer_pincode.value || !f.buyer_city.value || !f.buyer_state.value)
    return alert('Fill all delivery fields.');

  const ids = cart.map(i => i.id);
  const { data: latestProducts } = await supabase.from('daily2kartdata').select('id,price').in('id', ids);

  let updated = false;
  cart = cart.map(item => {
    const prod = latestProducts.find(p => p.id === item.id);
    if (prod && item.price !== prod.price) updated = true;
    item.price = prod ? prod.price : item.price;
    return item;
  });
  if (updated) {
    renderCart();
    return alert('Product prices have changed. Please review your cart.');
  }

  let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  let discount = subtotal > 1499 ? 50 : 0;
  let delivery = subtotal >= 999 ? 0 : 40;
  let cgst = 0, sgst = 0, igst = 0;

  const sellerState = "Tamil Nadu";

  const state = f.buyer_state.value.toLowerCase();
  if (state && state !== sellerState.toLowerCase()) {
    igst = +(subtotal * 0.05).toFixed(2);
  } else {
    cgst = +(subtotal * 0.025).toFixed(2);
    sgst = +(subtotal * 0.025).toFixed(2);
  }

  const grandTotal = subtotal - discount - bonus - coupon + delivery + cgst + sgst + igst;
  const order_id = 'ORD' + Date.now();

  const order = {
    order_id,
    user_id: currentUser ? currentUser.id : null,
    items: cart,
    total: subtotal,
    discount,
    bonus,
    coupon_code: couponCode,
    delivery_charge: delivery,
    cgst,
    sgst,
    igst,
    grand_total: grandTotal,
    name: f.buyer_name.value.trim(),
    phone: f.buyer_phone.value.trim(),
    altphone: "", // optional
    address: {
      address: f.buyer_address.value.trim(),
      pincode: f.buyer_pincode.value.trim(),
      city: f.buyer_city.value.trim(),
      state: f.buyer_state.value.trim()
    },
    payment_method: mode === 'cod' ? "COD" : "RAZORPAY",
    payment_id: mode === 'cod' ? "COD-" + order_id : "",
    status: mode === 'cod' ? "Pending" : "Paid",
    created_at: new Date().toISOString()
  };

  if (mode === 'cod') {
    const { error } = await supabase.from('orders').insert([order]);
    if (error) return alert("Order failed: " + error.message);
    alert("🎉 Order placed successfully!");
    localStorage.removeItem("cart");
    updateCartCount();
    closeCheckoutModal();
    closeCart();
    renderCart();
    return;
  }

  // Razorpay flow
  const options = {
    key: "rzp_live_3v8vgpBpWMxHX3", // your Razorpay key
    amount: grandTotal * 100,
    currency: "INR",
    name: "DAILY2KART",
    description: "Order Payment",
    handler: async function (response) {
      order.payment_id = response.razorpay_payment_id;
      order.status = "Paid";
      const { error } = await supabase.from('orders').insert([order]);
      if (error) return alert("Order failed: " + error.message);
      alert("✅ Payment successful and order placed!");
      localStorage.removeItem("cart");
      updateCartCount();
      closeCheckoutModal();
      closeCart();
      renderCart();
    },
    prefill: {
      name: f.buyer_name.value.trim(),
      email: currentUser?.email || '',
      contact: f.buyer_phone.value.trim()
    },
    theme: {
      color: "#f43f5e"
    }
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

// --- DARK MODE & BACK TO TOP/ Toggle dark mode ---

function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");

  // ✅ Just update the data-feather icon (don't remove/recreate elements)
  const icon = document.querySelector("#toggleDark i");
  if (icon) {
    icon.setAttribute("data-feather", isDark ? "sun" : "moon");
    feather.replace(); // This re-renders the feather icon
  }
}


// === SHOW/HIDE SCROLL-TO-TOP BUTTON hide backToTop button ===
window.addEventListener("scroll", () => {
 const backToTopBtn = document.getElementById("backToTopBtn");
 if (window.scrollY > 300) {
    backToTopBtn.classList.remove("hidden");
  } else {
    backToTopBtn.classList.add("hidden");
  }
});




// === SHOW TOAST FUNCTION ===
function showToast(message, type = "success") {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-400 text-black"
  };

  const toast = document.createElement("div");
  toast.className = `${colors[type] || colors.success} text-white px-4 py-2 rounded shadow transition transform scale-95 hover:scale-100`;
  toast.textContent = message;

  const container = document.getElementById("toast-container");
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0");
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

// === INIT FUNCTION (called on page load) ===
async function initApp() {
  // Set theme from localStorage
  const savedTheme = localStorage.getItem("theme");
  const html = document.documentElement;
  if (savedTheme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }

// Update feather icon based on saved theme
document.querySelectorAll('#toggleDark i').forEach(icon => {
  icon.setAttribute("data-feather", savedTheme === "dark" ? "sun" : "moon");
});
feather.replace();

  await checkSession();
  await loadBrands();
  await loadProducts();

  updateCartCount();
  updateWishlistCount();
}

// === CALL INIT ON LOAD ===
window.addEventListener("DOMContentLoaded", initApp);
