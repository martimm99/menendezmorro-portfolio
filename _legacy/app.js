// Simple portfolio app logic
(() => {
  // Analytics helper
  function trackEvent(eventName, parameters = {}) {
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, parameters);
    }
  }

  // Data: single source of truth loaded from assets/projects.json
  let projects = [];

  // State
  let activeFilter = 'all';
  // Optional sub-filter for 'design' and 'photo' (e.g., 'branding', 'web', 'titles', 'architecture', 'live')
  let activeSubFilter = '';
  let projectIndex = 0;
  let mediaIndex = 0;
  let themeTimer = null; // mid-switch theme timer
  let isAnimating = false; // block inputs during sweep
  // Input locks (module-scope so we can reset them on animation end)
  let mouseDebounce = false, mouseQuietTimer = null;
  // simplified touchpad lock: one trigger per swipe
  let tpActive = false, tpTimer = null;
  // remember axis and direction of the active swipe so repeated events
  // from the same physical gesture are ignored.
  let tpAxis = null, tpDir = 0;
  let startX = 0, startY = 0, distX = 0, distY = 0;
  let mobileRevealTimers = [];
  const slidesEl = document.getElementById('slides');
  const titleEl = document.getElementById('project-title');
  const roleEl = document.getElementById('project-role');
  const locEl = document.getElementById('project-location');
  const yearEl = document.getElementById('project-year');
  const descEl = document.getElementById('project-description');
  let homeSnapshotLayer = null;

  function timeToMs(value){
    if(!value) return 0;
    const num = parseFloat(value);
    if(!Number.isFinite(num)) return 0;
    return String(value).trim().endsWith('ms') ? num : num * 1000;
  }

  function animationTotalDuration(el){
    if(!el) return 0;
    const style = window.getComputedStyle(el);
    const durations = style.animationDuration.split(',').map(timeToMs);
    const delays = style.animationDelay.split(',').map(timeToMs);
    let longest = 0;
    durations.forEach((dur, index)=>{
      const delay = delays[index] ?? delays[delays.length - 1] ?? 0;
      const total = dur + delay;
      if(total > longest) longest = total;
    });
    return longest;
  }

  // Mobile menu
  const mobileMenu = document.getElementById('mobile-menu');
  const menuToggles = Array.from(document.querySelectorAll('.menu-toggle'));

  // Filter buttons
  const navItems = Array.from(document.querySelectorAll('.nav-item'));
  const mobileItems = Array.from(document.querySelectorAll('.mobile-item'));
  const navList = document.querySelector('.main-nav ul');
  // Track underline last known numeric state to avoid reading CSS variables mid-transition
  const underlineState = { left: 0, width: 0 };
  // Desktop subcategory hover state (supports multiple open groups)
  let subHover = { openedKinds: new Set(), items: [], closeTimer: null, opening: false, closing: false };
  const SUBCATS = {
    design: [
      { label: 'Branding', slug: 'branding' },
      { label: 'Web', slug: 'web' },
      { label: 'Titles', slug: 'titles' },
    ],
    photo: [
      { label: 'Architecture', slug: 'architecture' },
      { label: 'Live', slug: 'live' },
    ],
  };

  // Underline helpers (desktop only)
  function underlineEnabled(){
    return !!navList && window.matchMedia('(min-width: 601px)').matches;
  }
  function activeNavButton(){
    return navItems.find(n=>n.classList.contains('active')) || navItems[0] || null;
  }
  function getPaddingLR(el){
    const cs = window.getComputedStyle(el);
    return { pl: parseFloat(cs.paddingLeft) || 0, pr: parseFloat(cs.paddingRight) || 0 };
  }
  function measureBtnWidth(btn){
    const {pl, pr} = getPaddingLR(btn);
    return Math.max(0, btn.offsetWidth - pl - pr);
  }
  function assertActiveUnderline(){ const a = activeNavButton(); if(a) updateUnderline(a); }
  function updateUnderline(btn){
    if(!document.documentElement.contains(btn)) return;
    if(!navList) return;
  // Suppress updates only for subcategory buttons while opening/closing; allow top-level hovered item to update
  const isSubBtn = !!(btn.dataset && btn.dataset.sub);
  if((subHover.opening || subHover.closing) && isSubBtn) return;
    // Detect if any nav child is currently being FLIP-transformed; if so, prefer layout measurements
    const navIsShifting = (()=>{
      if(!navList) return false;
      const kids = Array.from(navList.children);
      return kids.some(el=>{
        const t = el && el.style ? el.style.transform : '';
        return t && t !== 'none';
      });
    })();
    const {pl, pr} = getPaddingLR(btn);
    let left, width;
    if(subHover.opening || subHover.closing || navIsShifting){
      // During FLIP transforms, measure from layout, not transforms.
      // Use the LI's offsetLeft (relative to UL) for left, but width from the button.
      const li = btn.closest('li');
      const base = (li && li.parentElement === navList) ? li : btn;
      left = (base.offsetLeft || 0) + pl;
      width = Math.max(0, btn.offsetWidth - pl - pr);
    }else{
      const listRect = navList.getBoundingClientRect();
      const rect = btn.getBoundingClientRect();
      if(!rect || rect.width <= 0) return;
      left = (rect.left - listRect.left) + pl;
      width = Math.max(0, rect.width - pl - pr);
    }
    // Clamp to nav width to avoid out-of-bounds
    const maxLeft = Math.max(0, navList.scrollWidth - width);
    left = Math.min(maxLeft, Math.max(0, left));
    navList.style.setProperty('--uline-left', left + 'px');
    navList.style.setProperty('--uline-width', width + 'px');
    // persist numeric values for robust snapshots later
    underlineState.left = left;
    underlineState.width = width;
  }

  // Capture underline screen position so we can keep it stable if the nav shifts horizontally
  function snapshotUnderline(){
    if(!navList || !document.documentElement.contains(navList)) return null;
    const navRect = navList.getBoundingClientRect();
    if(!navRect || !Number.isFinite(navRect.left)) return null;
    const safeLeft = Number.isFinite(underlineState.left) ? underlineState.left : 0;
    const safeWidth = Number.isFinite(underlineState.width) ? underlineState.width : 0;
    return { screenLeft: navRect.left + safeLeft, width: safeWidth };
  }

  // Initialize
  async function loadProjects(){
    try{
      const res = await fetch('assets/projects.json', {cache:'no-store'});
      if(!res.ok) return; // keep projects empty; SSR remains visible
      const data = await res.json();
      if(Array.isArray(data) && data.length) projects = data;
      updatePreloaderProgress(100);
    }catch(_e){ /* ignore */ }
  }

  // Preloader management
  function initPreloader(){
    const preloader = document.getElementById('preloader');
    const percentEl = document.getElementById('preloader-percent');
    if(!preloader) return;
    
    // Check if we're returning from navigating to another page
    // If so, skip the preloader. Only show on first load or hard refresh
    const navigatingFromHome = sessionStorage.getItem('navigatingFromHome');
    if(navigatingFromHome === 'true'){
      // We're returning from navigation away, skip preloader
      sessionStorage.removeItem('navigatingFromHome');
      preloader.style.display = 'none';
      return;
    }
    
    let minTimeElapsed = false;
    let dataLoaded = false;
    const startTime = Date.now();
    
    // Simulate gradual progress (0-90% over time smoothly)
    const progressInterval = setInterval(()=>{
      const elapsedMs = Date.now() - startTime;
      // Progress towards 90% over 2.5 seconds smoothly
      const currentProgress = Math.min((elapsedMs / 2500) * 90, 90);
      if(percentEl) percentEl.textContent = Math.floor(currentProgress) + '%';
    }, 50);
    
    // Minimum 2.5 seconds before allowing dismissal
    setTimeout(()=>{ minTimeElapsed = true; tryDismissPreloader(); }, 2500);
    
    window.updatePreloaderProgress = (percent)=>{
      dataLoaded = percent >= 100;
      tryDismissPreloader();
    };
    
    function tryDismissPreloader(){
      if(minTimeElapsed && dataLoaded){
        clearInterval(progressInterval);
        if(percentEl) percentEl.textContent = '100%';
        preloader.classList.add('dismissing');
        setTimeout(()=>{ 
          preloader.classList.remove('dismissing'); 
          preloader.style.display = 'none';
          // Only mark preloader as shown AFTER it's been dismissed
          sessionStorage.setItem('preloaderShown', 'true');
        }, 1000);
      }
    }
  }

  async function loadProjects(){
    try{
      const res = await fetch('assets/projects.json', {cache:'no-store'});
      if(!res.ok) return; // keep projects empty; SSR remains visible
      const data = await res.json();
      if(Array.isArray(data) && data.length) projects = data;
      updatePreloaderProgress(100);
    }catch(_e){ /* ignore */ }
  }

  async function init(){
    homeSnapshotLayer = showHomeSnapshot();
    bindUI();
    await loadProjects();
    applyProjectFromHash();
    // Build slides and perform an initial non-animated render
    renderSlides();
    // Re-render when crossing mobile breakpoint so Gloosito uses correct media set
    try{
      const mq = window.matchMedia('(max-width: 600px)');
      if(mq && mq.addEventListener){ mq.addEventListener('change', ()=> renderSlides()); }
      else if(mq && mq.addListener){ mq.addListener(()=> renderSlides()); }
    }catch(_e){}
    // Fallback for browsers without :has support to remove trailing comma
    try{
      if(!CSS.supports('selector(:has(*))')){
        const items = document.querySelectorAll('.main-nav li');
        items.forEach((li,i)=>{
          if(li.nextElementSibling && li.nextElementSibling.classList.contains('contact-link')){
            const btn = li.querySelector('.nav-item');
            if(btn){ btn.style.setProperty('--after-content', 'none'); btn.classList.add('no-comma'); }
          }
        });
      }
    }catch(_e){}
    window.addEventListener('hashchange', onHashChange);
  }

  function bindUI(){
    // Short-lived lock to suppress hover during collapse/open to avoid flicker
    let navLock = false;
    function startNavLock(ms){
      if(!navList) return;
      navLock = true;
      navList.classList.add('nav-lock');
      window.setTimeout(()=>{
        navLock = false;
        navList.classList.remove('nav-lock');
      }, Math.max(120, ms|0));
    }
    // filters
    navItems.forEach(btn=>btn.addEventListener('click', ()=>{
      // Lock hover while collapsing to original menu
      startNavLock(1000);
      // Defer underline update while subcategories collapse to avoid misplacement
      const defer = !!(subHover.items && subHover.items.length > 0);
      setFilter(btn.dataset.filter, { deferUnderline: defer });
      // If subcategories are open, close them when selecting a top-level filter
      try{ if(typeof closeSubcats === 'function') closeSubcats(); }catch(_e){}
      closeMobileMenu();
    }));
    mobileItems.forEach(btn=>btn.addEventListener('click', ()=>{
      setFilter(btn.dataset.filter);
      closeMobileMenu();
    }));

    // contact page navigation: snapshot current home/gallery state before leaving
    const contactLinks = Array.from(document.querySelectorAll('.contact-link a'));
    contactLinks.forEach(a=>{
      a.addEventListener('click', (event)=>{
        if(event.defaultPrevented) return;
        if(typeof event.button === 'number' && event.button !== 0) return; // only left click
        if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // allow new tab, etc
        // store snapshot once per navigation attempt
        snapshotHomeState();
      });
    });

    // menu toggle
    menuToggles.forEach(t=>t.addEventListener('click', ()=>{
      toggleMobileMenu();
    }));

    // Underline hover behavior
    if(navList){
      navItems.forEach(btn=>{
        btn.addEventListener('mouseenter', ()=>{
          if(navLock || subHover.closing || subHover.opening) return;
          // For top-level items that spawn subcategories: if already open, update underline to parent;
          // if not yet open, let openSubcats() handle the initial animation.
          const isTopLevel = !!(btn.dataset && btn.dataset.filter);
          const spawnsSub = isTopLevel && (btn.dataset.filter in SUBCATS);
          if(spawnsSub){
            const isOpen = !!(subHover.openedKinds && subHover.openedKinds.has(btn.dataset.filter));
            if(isOpen) updateUnderline(btn);
            return;
          }
          updateUnderline(btn);
        });
        btn.addEventListener('mouseleave', (e)=>{
          // If moving to another element inside the nav, don't reset underline here
          const to = e && e.relatedTarget ? e.relatedTarget : null;
          if(to && navList && navList.contains(to)) return;
          // While any subcategories are open, nav-level handlers manage the underline
          if(subHover.items && subHover.items.length) return;
          assertActiveUnderline();
        });
      });
      navList.addEventListener('mouseleave', ()=>{
        // If any subcategories are open, defer underline reset until after they close
        if(subHover.items && subHover.items.length) return;
        assertActiveUnderline();
      });
      window.addEventListener('resize', ()=>{ assertActiveUnderline(); });
      // initial position after load
      requestAnimationFrame(()=>{ assertActiveUnderline(); });

      // Desktop-only subcategory reveal on hover
      const desktopQuery = window.matchMedia('(min-width: 601px)');
      function isDesktop(){ return desktopQuery.matches; }
      function findTopLevelButton(filter){
        return navItems.find(n=> n.dataset && n.dataset.filter === filter) || null;
      }
  function liOf(el){ return el && el.closest ? el.closest('li') : null; }
      function clearCloseTimer(){ if(subHover.closeTimer){ clearTimeout(subHover.closeTimer); subHover.closeTimer = null; } }
  function scheduleClose(){ clearCloseTimer(); subHover.closeTimer = setTimeout(closeSubcats, 120); }
      // FLIP helpers for smooth horizontal shifts when (un)inserting subcategories
      function captureLefts(){
        if(!navList) return new Map();
        const m = new Map();
        Array.from(navList.children).forEach(el=>{ const r = el.getBoundingClientRect(); m.set(el, r.left); });
        return m;
      }
      const NAV_FLIP_MS = 300;
      function runFLIP(before, duration=NAV_FLIP_MS, skipEl=null){
        if(!navList) return;
        // If we don't have a valid snapshot, just unfreeze immediately
        if(!before || before.size===0){ if(navList) navList.classList.remove('uline-freeze'); return; }
        const easing = 'cubic-bezier(.33,1,.55,1)';
        const nowChildren = Array.from(navList.children);
        const animated = [];
        nowChildren.forEach(el=>{
          if(skipEl && (el===skipEl || el.contains(skipEl))) return; // don't transform target item
          if(!before.has(el)) return; // new elements won't animate via FLIP here
          const prevLeft = before.get(el);
          const curLeft = el.getBoundingClientRect().left;
          const dx = prevLeft - curLeft;
          if(Math.abs(dx) > 0.1){
            // Set initial state without transition, then animate to 0
            el.style.transition = 'none';
            el.style.transform = `translateX(${dx}px)`;
            animated.push(el);
          }
        });
        let count = animated.length;
        if(count === 0){ navList.classList.remove('uline-freeze'); }
        // Force reflow so the initial transform is committed
        void navList.offsetWidth;
        // Next frame, apply transition and animate to the final position
        requestAnimationFrame(()=>{
          animated.forEach(el=>{
            el.style.transition = `transform ${duration}ms ${easing}`;
            el.style.transform = 'translateX(0)';
            const onEnd = (ev)=>{
              if(ev && ev.propertyName && ev.propertyName !== 'transform') return;
              el.style.transition = '';
              el.style.transform = '';
              el.removeEventListener('transitionend', onEnd);
              count--;
              if(count===0){ navList.classList.remove('uline-freeze'); }
            };
            el.addEventListener('transitionend', onEnd);
          });
        });
        // Fallback: ensure removal even if transitionend doesn't fire (e.g., tab switch)
        setTimeout(()=>{ if(navList) navList.classList.remove('uline-freeze'); }, duration+60);
      }
      // Place underline at a specific start (no transition), then re-enable transition and animate to target
      function animateUnderlineFrom(startLeft, startWidth, targetBtn){
        if(!navList) return;
        const width = Math.max(0, Number.isFinite(startWidth) ? startWidth : (underlineState.width || 0));
        let left = Number.isFinite(startLeft) ? startLeft : (underlineState.left || 0);
        const max = Math.max(0, navList.scrollWidth - width);
        left = Math.min(max, Math.max(0, left));
        navList.classList.add('uline-freeze');
        navList.style.setProperty('--uline-left', left + 'px');
        navList.style.setProperty('--uline-width', width + 'px');
        underlineState.left = left;
        underlineState.width = width;
        requestAnimationFrame(()=>{
          // Re-enable transition and force a reflow so the next update animates
          navList.classList.remove('uline-freeze');
          void navList.offsetWidth; // reflow
          const target = (targetBtn && targetBtn.isConnected) ? targetBtn : activeNavButton();
          if(target) updateUnderline(target);
        });
      }
      function closeSubcats(){
        clearCloseTimer();
        if(!subHover.items.length) return;
        const underlineSnapshot = snapshotUnderline();
        subHover.closing = true;
    // Capture positions for FLIP glide; allow underline to animate normally (no freeze)
    const before = captureLefts();
        subHover.items.forEach(el=> el.remove());
        subHover.items = [];
        if(subHover.openedKinds && typeof subHover.openedKinds.clear === 'function') subHover.openedKinds.clear();
        const active = activeNavButton();
        const activeLi = active ? active.closest('li') : null;
        if(active && navList){
          if(underlineSnapshot){
            const afterRect = navList.getBoundingClientRect();
            if(afterRect && Number.isFinite(afterRect.left)){
              const startLeft = underlineSnapshot.screenLeft - afterRect.left;
              animateUnderlineFrom(startLeft, underlineSnapshot.width, active);
            }else{
              updateUnderline(active);
            }
          }else{
            updateUnderline(active);
          }
        }
  // Include the active item in FLIP so it glides back smoothly (underline is anchored separately)
  runFLIP(before, NAV_FLIP_MS);
        // Clear closing flag after FLIP duration
  setTimeout(()=>{ 
    subHover.closing = false; 
    // Final reassert to ensure underline matches the active item once all transforms are cleared
    const a = activeNavButton();
    if(a) updateUnderline(a);
  }, NAV_FLIP_MS);
      }
      // Prevent premature close when moving from subcats to any top-level item (e.g., "All")
      navItems.forEach(btn=> btn.addEventListener('mouseenter', clearCloseTimer));
      function openSubcats(kind){
        if(!isDesktop()) return;
        if(navLock) return; // ignore during lock
        if(subHover.openedKinds && subHover.openedKinds.has(kind)) return; // already open for this kind
        if(!(kind in SUBCATS)) return;
        subHover.opening = true;
        const parentBtn = findTopLevelButton(kind);
  const parentLi = liOf(parentBtn);
        if(!parentBtn || !parentLi || !navList) return;
        const insertBefore = parentLi; // Insert subcategories directly before hovered parent
  const before = captureLefts();
  // Snapshot current underline screen position BEFORE insertion so we can animate from the true on-screen start
  const underlineSnapshot = snapshotUnderline();
        const created = [];
        SUBCATS[kind].forEach((sc,i)=>{
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'nav-item subcat';
          // Build label + animated comma inside the reveal wrapper so both animate together
          const labelText = document.createTextNode(sc.label);
          const commaSpan = document.createElement('span');
          commaSpan.className = 'comma';
          commaSpan.textContent = ',';
          btn.appendChild(labelText);
          btn.appendChild(commaSpan);
          btn.dataset.sub = sc.slug;
          btn.dataset.parent = kind;
          // Reveal wrapper
          wrapForReveal(btn);
          li.appendChild(btn);
          navList.insertBefore(li, insertBefore);
          created.push(li);
          // Click behavior: prioritize subcategory
          btn.addEventListener('click', ()=>{
            startNavLock(1000);
            // Defer underline while closing subcategories; we will reassert after FLIP
            setFilter(kind, { deferUnderline: true });
            setSubFilter(sc.slug);
            closeSubcats();
          });
          // Underline follows hovered subcategory
          btn.addEventListener('mouseenter', ()=>{ if(btn.isConnected) updateUnderline(btn); });
          btn.addEventListener('focus', ()=>{ if(btn.isConnected) updateUnderline(btn); });
        });
    // Accumulate created items and mark this group as open
        subHover.items.push(...created);
        if(subHover.openedKinds) subHover.openedKinds.add(kind);
  // After insertion, animate underline from its pre-insert on-screen position to the hovered parent
  if(underlineSnapshot){
    const afterRect = navList.getBoundingClientRect();
    if(afterRect && Number.isFinite(afterRect.left)){
      const startLeft = underlineSnapshot.screenLeft - afterRect.left;
      // Measure target (layout) to get a safe non-zero width fallback
      const targetWidth = measureBtnWidth(parentBtn);
      const startWidth = (underlineState.width && underlineState.width > 0) ? underlineState.width : targetWidth;
      animateUnderlineFrom(startLeft, startWidth, parentBtn);
    } else {
      if(parentBtn && parentBtn.isConnected) updateUnderline(parentBtn);
    }
  } else {
    if(parentBtn && parentBtn.isConnected) updateUnderline(parentBtn);
  }
  // FLIP animate other items shifting to make room (skip transforming parent so underline origin stays true)
  const parentLiSkip = parentBtn ? parentBtn.closest('li') : null;
  const FLIP_MS = NAV_FLIP_MS; // keep in sync with runFLIP call
  runFLIP(before, FLIP_MS, parentLiSkip);
  // Clear opening flag after FLIP duration
  setTimeout(()=>{ subHover.opening = false; }, FLIP_MS);
  // Reveal animation stagger: start AFTER FLIP completes so items are visible/stable
  const STAGGER_MS = 80; // stagger between items
  // Start a bit earlier than FLIP end so first labels begin revealing sooner
  const START_AFTER = Math.max(100, FLIP_MS - 100);
  created.forEach((li, i)=>{
    const clip = li.querySelector('.reveal-line-clip');
    if(!clip) return;
    setTimeout(()=>{ clip.classList.add('reveal-in'); }, START_AFTER + i*STAGGER_MS);
  });
  // Keep group open while hovering parent or subcats
  parentLi.addEventListener('mouseenter', clearCloseTimer);
  created.forEach(li=> li.addEventListener('mouseenter', clearCloseTimer));
  // Removed per-subcategory mouseleave close scheduling; closing now only on full nav mouseleave or explicit click.
      }
      // Close on resize to mobile
      desktopQuery.addEventListener('change', (e)=>{ if(!e.matches) closeSubcats(); });

      // Bind hover triggers for top-level categories
      const designBtn = findTopLevelButton('design');
      if(designBtn) designBtn.addEventListener('mouseenter', ()=> isDesktop() && openSubcats('design'));
      const photoBtn = findTopLevelButton('photo');
      if(photoBtn) photoBtn.addEventListener('mouseenter', ()=> isDesktop() && openSubcats('photo'));

      // Bind nav-level keep-open/close handlers once
      if(!navList.dataset.subhoverBound){
        navList.addEventListener('mouseenter', clearCloseTimer);
        navList.addEventListener('mouseleave', scheduleClose);
        navList.dataset.subhoverBound = 'true';
      }
    }

    // keyboard navigation
    window.addEventListener('keydown', (e)=>{
      if(isAnimating) return;
      if(e.key === 'ArrowRight') next();
      if(e.key === 'ArrowLeft') prev();
    });

  // wheel: one-per-swipe for touchpad/Magic Mouse; keep mouse wheel debounced
  // Match the gesture quiet window to the sweep animation so the user only
  // needs to wait the same time as the sweep (see D in showCurrent()).
  const GESTURE_QUIET_MS = 500; // ms
  const MOUSE_QUIET_MS = 120;
  const SWIPE_THRESHOLD = 4; // lower threshold so a short flick/notch triggers once
    window.addEventListener('wheel', (e)=>{
      if(e.target && e.target.closest && e.target.closest('.contact-text')) return;
      const pixelMode = e.deltaMode === 0; // touchpad / Magic Mouse
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      if(pixelMode){
        // ignore during sweep
        if(isAnimating) return;

        // If a swipe is already active, ignore subsequent events that match
        // the same axis+direction (they're part of the same physical gesture).
        if(tpActive){
          const curAxis = (absX > absY) ? 'x' : 'y';
          const curDir = (curAxis === 'x') ? Math.sign(e.deltaX) : Math.sign(e.deltaY);
          if(tpAxis && tpDir && curAxis === tpAxis && curDir === tpDir) return;
          // otherwise allow cross-axis events to be processed
        }

        // start a lock and trigger one nav (horizontal)
        if(absX > absY && absX >= SWIPE_THRESHOLD){
          tpActive = true; tpAxis = 'x'; tpDir = (e.deltaX>0)?1:-1;
          if(tpTimer) clearTimeout(tpTimer);
          tpTimer = setTimeout(()=>{ tpActive=false; tpTimer=null; tpAxis=null; tpDir=0; }, GESTURE_QUIET_MS);
          if(e.deltaX > 0) next(); else prev();
          return;
        }

        // vertical
        if(absY > absX && absY >= SWIPE_THRESHOLD){
          tpActive = true; tpAxis = 'y'; tpDir = (e.deltaY>0)?1:-1;
          if(tpTimer) clearTimeout(tpTimer);
          tpTimer = setTimeout(()=>{ tpActive=false; tpTimer=null; tpAxis=null; tpDir=0; }, GESTURE_QUIET_MS);
          if(e.deltaY > 0) next(); else prev();
          return;
        }
        return; // ignore tiny movements
      }

  // Mouse wheel (line/page deltas): simple debounce, low threshold (one notch)
      if (mouseQuietTimer) clearTimeout(mouseQuietTimer);
      mouseQuietTimer = setTimeout(()=>{ mouseDebounce = false; mouseQuietTimer = null; }, MOUSE_QUIET_MS);
      if(mouseDebounce || isAnimating) return;
      if(absX > absY && absX >= 1){
        mouseDebounce = true;
        if(e.deltaX > 0) next(); else prev();
        return;
      }
  if(absY > absX && absY >= 1){
        mouseDebounce = true;
        if(e.deltaY > 0) next(); else prev();
      }
    }, {passive:true});
    window.addEventListener('touchstart', (e)=>{
      const t = e.touches[0]; startX=t.clientX; startY=t.clientY; distX=0; distY=0;
    }, {passive:true});
    window.addEventListener('touchmove', (e)=>{
      const t=e.touches[0]; distX=t.clientX-startX; distY=t.clientY-startY;
    }, {passive:true});
    window.addEventListener('touchend', (e)=>{
      if(isAnimating) return;
      const absX = Math.abs(distX), absY = Math.abs(distY);
      if(absX > absY && absX > 20){
        if(distX > 0) prev(); else next();
      } else if(absY > absX && absY > 20){
        // no action on vertical swipe per spec
      }
    }, {passive:true});

    // Clicking title or role opens the project page
    const openProjectPage = ()=>{
      const fps = filteredProjects();
      if(!fps.length) return;
      const id = fps[projectIndex].id;
      snapshotHomeState();
      location.href = `project.html#${encodeURIComponent(id)}`;
    };
    titleEl.addEventListener('click', openProjectPage);
    roleEl.addEventListener('click', openProjectPage);
  }

  function renderSlides(){
    // no-op to keep function order reference
  }

  // Return the media list visible for current viewport
  function visibleMediaOf(p){
    if(!p || !Array.isArray(p.media)) return [];
    try{
      const isMobile = window.matchMedia('(max-width: 600px)').matches;
      const media = p.media;
      // Helpers to keep per-project rules concise and maintain behavior
      const excludeMobile = list => list.filter(m => !String(m?.src || '').includes('-mobile'));
      const preferMobileByBase = list => {
        const byBase = new Map();
        const order = [];
        list.forEach(m => {
          const s = String(m?.src || '');
          const base = s.replace(/-mobile(?=\.[^/.]+$)/, '');
          if(!byBase.has(base)) order.push(base);
          const existing = byBase.get(base);
          const isMob = s.includes('-mobile');
          if(!existing || isMob){ byBase.set(base, m); }
        });
        return order.map(b => byBase.get(b)).filter(Boolean);
      };
      const MEDIA_RULES = {
        gloosito: (list, mobile) => list.filter(m => mobile ? String(m?.src||'').includes('-mobile') : !String(m?.src||'').includes('-mobile')),
        madison_beer: (list, mobile) => mobile ? preferMobileByBase(list) : excludeMobile(list),
        coaatmca: (list, mobile) => {
          if(!mobile) return excludeMobile(list);
          // Mobile: include all except the non-mobile COAATMCA_7
          return list.filter(m => {
            const s = String(m?.src || '');
            const isSevenBase = /COAATMCA_7(?=\.[^/.]+$)/.test(s);
            const isMobileVariant = s.includes('-mobile');
            return !(isSevenBase && !isMobileVariant);
          });
        }
      };
      const rule = MEDIA_RULES[String(p.id||'').toLowerCase()];
      if(rule) return rule(media, isMobile);
      return media;
    }catch(_e){ return p.media; }
  }

  function renderSlides(){
    const fps = filteredProjects();
  if(!fps.length) return; // keep SSR content until data loads
  slidesEl.innerHTML = '';
    fps.forEach((p,pi)=>{
      const visible = visibleMediaOf(p);
      visible.forEach((m,mi)=>{
        const slide = document.createElement('div');
        slide.className = 'slide';
        slide.dataset.projectIndex = pi;
        slide.dataset.mediaIndex = mi;
        slide.dataset.projectId = p.id;
        slide.style.zIndex = 10 + pi*10 + mi;
        if(m.type === 'image'){
          const img = document.createElement('img');
          img.src = m.src;
          img.loading = (pi===0 && mi===0) ? 'eager' : 'lazy';
          if(pi===0 && mi===0) img.fetchPriority = 'high';
          img.decoding = 'async';
          img.alt = p.title + ' image ' + (mi+1);
          slide.appendChild(img);
        } else if(m.type === 'video'){
          const vid = document.createElement('video');
          // Use <source> with explicit type to improve compatibility
          const srcEl = document.createElement('source');
          srcEl.src = m.src;
          srcEl.type = 'video/mp4';
          vid.appendChild(srcEl);
          // Autoplay-safe settings for mobile/iOS
          vid.autoplay = true; vid.setAttribute('autoplay','');
          vid.loop = true; vid.setAttribute('loop','');
          vid.muted = true; vid.setAttribute('muted','');
          vid.playsInline = true; vid.setAttribute('playsinline',''); vid.setAttribute('webkit-playsinline','');
          vid.controls = false;
          // Prefer eager loading so first frame shows (avoid black)
          vid.preload = 'auto';
          slide.appendChild(vid);
          // Ensure playback starts after sufficient data is available
          try{
            const start = ()=>{ try{ vid.play().catch(()=>{}); }catch(_){} };
            vid.addEventListener('loadeddata', start, { once: true });
            requestAnimationFrame(start);
          }catch(_e){}
        }
  // ensure slides are hidden by default to avoid brief flashes while JS
  // initializes visibility (prevents flicker when switching windows)
  slide.style.visibility = 'hidden';
  slidesEl.appendChild(slide);
      });
    });
    // adjust projectIndex if out of range
    if(projectIndex >= fps.length) projectIndex = 0;
    mediaIndex = Math.min(mediaIndex, (visibleMediaOf(fps[projectIndex])?.length||1)-1);
    showCurrent(false);
    removeHomeSnapshotLayer();
  }

      function filteredProjects(){
        if(activeFilter === 'all') return projects;
        // Helper to normalize value to array of lowercase strings
        function toArr(val) {
          if (Array.isArray(val)) return val.map(s => String(s).toLowerCase().trim());
          if (typeof val === 'string') return val.split(',').map(s => s.toLowerCase().trim());
          return [];
        }
        let list = projects.filter(p => toArr(p?.type).includes(activeFilter));
        const sub = (activeSubFilter || '').toLowerCase();
        if(sub && sub !== 'all' && (activeFilter === 'design' || activeFilter === 'photo')) {
          const prioritized = list.filter(p => toArr(p?.subcategory).includes(sub));
          const remainder = list.filter(p => !toArr(p?.subcategory).includes(sub));
          return [...prioritized, ...remainder];
        }
        return list;
      }

  function flatIndexFor(fps, targetProject, targetMedia){
    let idx = 0;
    for(let i = 0; i < fps.length; i++){
      const mediaCount = visibleMediaOf(fps[i]).length;
      if(i === targetProject){
        return idx + Math.min(targetMedia, Math.max(mediaCount - 1, 0));
      }
      idx += mediaCount;
    }
    return 0;
  }

  function showCurrent(shouldSweep){
    const fps = filteredProjects();
    if(!fps.length) return;
  const targetFlatIndex = flatIndexFor(fps, projectIndex, mediaIndex);
    const p = fps[projectIndex];
    const m = visibleMediaOf(p)[mediaIndex];

    let nextMode = 'dark';
    if(m){
      const t = m.tone;
      if(t === 'bright' || t === 'light') nextMode = 'light';
      else if(t === 'dark') nextMode = 'dark';
    }

  const D = 1000; // ms — keep in sync with :root --project-sweep-duration

    // previously visible and direction inference
    const prevSlide = Array.from(slidesEl.children).find(s=>s.getAttribute('aria-hidden') === 'false');
    const prevPi = prevSlide ? Number(prevSlide.dataset.projectIndex) : projectIndex;
    const prevMi = prevSlide ? Number(prevSlide.dataset.mediaIndex) : mediaIndex;
    const dir = (prevPi !== projectIndex) ? (projectIndex > prevPi ? 'btt' : 'ttb')
               : (prevMi !== mediaIndex) ? (mediaIndex > prevMi ? 'rtl' : 'ltr')
               : 'rtl';

    const outgoing = prevSlide || null;
    const incoming = Array.from(slidesEl.children).find(s=> Number(s.dataset.projectIndex)===projectIndex && Number(s.dataset.mediaIndex)===mediaIndex) || null;

    // helper to finalize end-state layering
    const finalizeLayering = () => {
      Array.from(slidesEl.children).forEach((s)=>{
        const si = Number(s.dataset.projectIndex);
        const mi = Number(s.dataset.mediaIndex);
        const isCurrent = (si === projectIndex && mi === mediaIndex);
        s.setAttribute('aria-hidden', String(!isCurrent));
        s.style.transform = '';
        s.style.zIndex = isCurrent ? '2' : '1';
        s.style.visibility = isCurrent ? 'visible' : 'hidden';
        s.style.clipPath = '';
        s.style.transition = '';
        s.style.willChange = '';
      });
      // If the current slide contains a video, ensure it plays
      try{
        const cur = Array.from(slidesEl.children).find(s=> s.getAttribute('aria-hidden') === 'false');
        const vid = cur ? cur.querySelector('video') : null;
        if(vid){ vid.play().catch(()=>{}); }
      }catch(_e){}
      // Centralize unlocks after any render (animated or not)
      isAnimating = false;
      if(tpTimer){ clearTimeout(tpTimer); tpTimer = null; }
      tpActive = false; tpAxis = null; tpDir = 0;
      mouseDebounce = false; if(mouseQuietTimer){ clearTimeout(mouseQuietTimer); mouseQuietTimer = null; }
    };

    const clipStartValues = {
      rtl: 'inset(0 0 0 100%)',
      ltr: 'inset(0 100% 0 0)',
      btt: 'inset(0 0 100% 0)',
      ttb: 'inset(100% 0 0 0)'
    };
    const clipEndValue = 'inset(0 0 0 0)';
    let sweepTimer = null;
    let sweepCompleted = false;

    if(incoming){
  // Prep incoming/outgoing stacking so the sweep reveals over the true outgoing
      incoming.style.zIndex = '999';
      if(outgoing) outgoing.style.zIndex = '998';

      if(shouldSweep && outgoing){
        isAnimating = true;
        const startClip = clipStartValues[dir] || clipStartValues.rtl;
        const transitionValue = `clip-path ${D}ms cubic-bezier(.77,0,.175,1)`;
        const webkitTransitionValue = `-webkit-clip-path ${D}ms cubic-bezier(.77,0,.175,1)`;

        incoming.style.visibility = 'visible';
        incoming.style.willChange = 'clip-path';
        incoming.style.transition = 'none';
        incoming.style.webkitTransition = 'none';
        incoming.style.clipPath = startClip;
        

        outgoing.style.visibility = 'visible';
        outgoing.style.transition = 'none';
        outgoing.style.clipPath = clipEndValue;

        let onTransitionEnd = null;
        const finalizeSweep = () => {
          if(sweepCompleted) return;
          sweepCompleted = true;
          if(sweepTimer){ clearTimeout(sweepTimer); sweepTimer = null; }
          if(onTransitionEnd) incoming.removeEventListener('transitionend', onTransitionEnd);
          incoming.style.willChange = '';
          finalizeLayering();
        };

        onTransitionEnd = (ev) => {
          if(!ev || !ev.propertyName || ev.propertyName.indexOf('clip') === -1) return;
          finalizeSweep();
        };

        sweepTimer = setTimeout(finalizeSweep, D + 80);

        requestAnimationFrame(()=>{
          // Ensure the hidden start state is committed before kicking off the transition
          // eslint-disable-next-line no-unused-expressions
          incoming.offsetHeight;
          requestAnimationFrame(()=>{
            incoming.addEventListener('transitionend', onTransitionEnd);
            incoming.style.transition = transitionValue;
            incoming.style.clipPath = clipEndValue;
          });
        });
      } else {
        incoming.style.visibility = 'visible';
        incoming.style.clipPath = clipEndValue;
        incoming.style.webkitClipPath = clipEndValue;
        if(outgoing){
          outgoing.style.clipPath = clipEndValue;
          outgoing.style.webkitClipPath = clipEndValue;
        }
        finalizeLayering();
      }
    } else {
      finalizeLayering();
    }

    // Helper to update info elements
    function updateInfo() {
      titleEl.textContent = p.title;
      roleEl.textContent = p.role;
      locEl.textContent = p.location;
      yearEl.textContent = p.year;
      descEl.textContent = p.description;
    }
    // Get info elements for animation
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    const infoElements = isMobile
      ? [titleEl, roleEl]
      : [titleEl, roleEl, locEl, yearEl, descEl];
    // Animate only when changing projects
    if (prevPi !== projectIndex) {
      const isNext = projectIndex > prevPi;
      const outClass = isNext ? 'slide-down-out' : 'slide-up-out';
      const inClass = isNext ? 'slide-down-in' : 'slide-up-in';
      infoElements.forEach(el => {
        el.classList.remove('slide-up-in', 'slide-down-in', 'slide-up-out', 'slide-down-out');
        el.classList.add(outClass);
      });
      const OUT_DELAY = Math.round(D * 0.6); // reduced delay for snappier feel
      setTimeout(() => {
        updateInfo();
        infoElements.forEach(el => {
          el.classList.remove(outClass);
          el.classList.add(inClass);
        });
        setTimeout(() => {
          infoElements.forEach(el => {
            el.classList.remove(inClass);
          });
        }, D);
      }, OUT_DELAY);
    } else {
      updateInfo();
    }

    if(themeTimer) clearTimeout(themeTimer);
    themeTimer = setTimeout(()=>{
      document.documentElement.classList.toggle('theme-dark', nextMode === 'dark');
      document.documentElement.classList.toggle('theme-light', nextMode === 'light');
      themeTimer = null;
    }, D/2);

    const h = `#${encodeURIComponent(p.id)}`;
    if(location.hash !== h) history.replaceState(null,'',h);
  }

  function snapshotHomeState(){
    try{
      const current = slidesEl ? Array.from(slidesEl.children).find(s=>s.getAttribute('aria-hidden') === 'false') || slidesEl.firstElementChild : null;
      const imgEl = current && current.querySelector ? current.querySelector('img') : null;
      const imgSrc = imgEl ? (imgEl.currentSrc || imgEl.src || '') : '';
      if(imgSrc) sessionStorage.setItem('projectBg', imgSrc);
      else sessionStorage.removeItem('projectBg');
  const fps = filteredProjects();
  const activeProject = fps[projectIndex];
  if(activeProject){
    sessionStorage.setItem('projectId', activeProject.id);
    sessionStorage.setItem('projectMedia', String(mediaIndex));
  } else {
    sessionStorage.removeItem('projectId');
    sessionStorage.removeItem('projectMedia');
  }
  // Mark that we're about to navigate away from home page
  sessionStorage.setItem('navigatingFromHome', 'true');
  const header = document.querySelector('.site-header');
  const titleSlot = document.getElementById('title-slot');
  const roleSlot = document.getElementById('role-slot');
  const info = document.getElementById('project-info');
  let markup = '';
  if(header) markup += header.outerHTML;
  if(titleSlot) markup += titleSlot.outerHTML;
  if(roleSlot) markup += roleSlot.outerHTML;
  if(info) markup += info.outerHTML;
      if(markup) sessionStorage.setItem('projectUI', markup);
      else sessionStorage.removeItem('projectUI');
    }catch(_e){}
  }

  function buildSnapshotLayer(){
    try{
      const bg = sessionStorage.getItem('projectBg');
      const ui = sessionStorage.getItem('projectUI');
      if(!bg && !ui) return null;
      const layer = document.createElement('div');
      layer.className = 'project-temp-layer';
      if(bg){
        const img = document.createElement('img');
        img.src = bg;
        img.alt = '';
        img.loading = 'eager';
        img.decoding = 'async';
        layer.appendChild(img);
      }
      if(ui){
        const uiWrap = document.createElement('div');
        uiWrap.className = 'project-temp-ui';
        uiWrap.innerHTML = ui;
        layer.appendChild(uiWrap);
      }
      return layer;
    }catch(_e){ return null; }
  }

  function setFilter(f, opts){
    const options = opts || {};
    activeFilter = f;
    // Reset sub-filter on top-level change to avoid stale subcategory constraints
    activeSubFilter = '';
    // update active classes
    navItems.forEach(n=>{
      const isActive = n.dataset.filter===f;
      n.classList.toggle('active', isActive);
      n.setAttribute('aria-pressed', String(isActive));
    });
    mobileItems.forEach(n=>{
      const isActive = n.dataset.filter===f;
      n.classList.toggle('active', isActive);
      n.setAttribute('aria-pressed', String(isActive));
    });
    // move underline to new active (desktop only) unless deferred during collapse
    const shouldDefer = !!options.deferUnderline || (subHover.items && subHover.items.length > 0);
    if(!shouldDefer){
      const a = activeNavButton();
      if(a) updateUnderline(a);
    }
    // re-render slides
    projectIndex = 0; mediaIndex = 0;
    renderSlides();
  }

  // Set subcategory filter without changing top-level filter. Call renderSlides() to apply.
  // Accepted values for design: 'branding','web','titles'; for photo: 'architecture','live'.
  function setSubFilter(sub){
    activeSubFilter = (sub || '').toLowerCase();
    renderSlides();
  }

  function next(){
  const fps = filteredProjects();
  if(!fps.length) return; // don’t lock if nothing to show yet
   const p = fps[projectIndex];
     if(mediaIndex < visibleMediaOf(p).length -1){ mediaIndex++; }
     else { // go to next project
       if(projectIndex < fps.length -1){ projectIndex++; mediaIndex = 0; }
       else { projectIndex = 0; mediaIndex = 0; }
     }
     showCurrent(true);
   }
   function prev(){
  const fps = filteredProjects();
  if(!fps.length) return; // don’t lock if nothing to show yet
   const p = fps[projectIndex];
     if(mediaIndex > 0){ mediaIndex--; }
     else {
       if(projectIndex > 0){ projectIndex--; const np = fps[projectIndex]; mediaIndex = Math.max(visibleMediaOf(np).length-1, 0); }
       else { projectIndex = fps.length-1; mediaIndex = Math.max(visibleMediaOf(fps[fps.length-1]).length-1, 0); }
     }
     showCurrent(true);
   }

  function onHashChange(){
    applyProjectFromHash();
    renderSlides();
    showCurrent(false);
    // If returning to home (empty hash), rebind UI in case it was unbound
    if(!location.hash || location.hash === '#') {
      bindUI();
    }
  }

  function applyProjectFromHash(){
    const raw = location.hash.replace(/^#/, '');
    let proj = null;
    // Expected style: :id
    if(raw && !raw.startsWith('/')){
      const path = raw.split('?')[0];
      proj = decodeURIComponent(path);
    }
    if(proj){
      const fps = filteredProjects();
      const idx = fps.findIndex(p=>p.id === proj);
      if(idx >=0){
        projectIndex = idx;
        const savedId = sessionStorage.getItem('projectId') || '';
        const savedMediaRaw = sessionStorage.getItem('projectMedia');
        const savedMedia = savedMediaRaw !== null ? Number(savedMediaRaw) : NaN;
        const maxMedia = Math.max(visibleMediaOf(fps[idx]).length - 1, 0);
        if(savedId === proj && Number.isInteger(savedMedia)){
          mediaIndex = Math.min(Math.max(savedMedia, 0), maxMedia);
        } else {
          mediaIndex = 0;
        }
      } else {
        mediaIndex = 0;
      }
    }
  }

  // mobile menu helpers
  function toggleMobileMenu(){
    const wasOpen = mobileMenu.classList.contains('open');
    if(!wasOpen){
      // open
      mobileMenu.classList.add('open');
      mobileMenu.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('menu-open');
      menuToggles.forEach(t=>t.setAttribute('aria-expanded', 'true'));
      const first = mobileMenu.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if(first) first.focus({preventScroll:true});
      setupMobileMenuReveal();
    } else {
      // close with sweep
      closeMobileMenu();
    }
  }
  function closeMobileMenu(){
    const motionReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!mobileMenu.classList.contains('open')) return;
    // Cancel any pending post-sweep reveal timers to avoid late triggers during/after close
    if(mobileRevealTimers.length){ mobileRevealTimers.forEach(id=>clearTimeout(id)); mobileRevealTimers = []; }
    if(motionReduce.matches){
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('menu-open');
      menuToggles.forEach(t=>t.setAttribute('aria-expanded', 'false'));
      return;
    }
  // Trigger closing sweep (bottom->top). Force a style flush so WebKit restarts the animation reliably
  mobileMenu.classList.remove('closing');
  void mobileMenu.offsetWidth;
  mobileMenu.classList.add('closing');
    const duration = animationTotalDuration(mobileMenu) || 1000;
    const EARLY_ICON_DELAY =  Math.round(duration * 0.60);
    let earlyIconTimer = setTimeout(()=>{
      if(!mobileMenu.classList.contains('closing')) return;
      document.documentElement.classList.remove('menu-open');
    }, EARLY_ICON_DELAY);
    let done = false;
    const finalize = ()=>{
      if(done) return; done = true;
      if(earlyIconTimer){ clearTimeout(earlyIconTimer); earlyIconTimer = null; }
      mobileMenu.classList.remove('open','closing');
      mobileMenu.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('menu-open');
      menuToggles.forEach(t=>t.setAttribute('aria-expanded', 'false'));
    };
    const onEnd = (ev)=>{
      if(ev && ev.target !== mobileMenu) return;
      if(ev && ev.animationName && ev.animationName !== 'contact-bg-close') return; // reuse keyframe
      mobileMenu.removeEventListener('animationend', onEnd);
      finalize();
    };
    mobileMenu.addEventListener('animationend', onEnd);
    setTimeout(finalize, duration + 120);
  }

  // updateUI removed; showCurrent handles text updates after render

  // no debug globals exposed

  // ---- Project page helpers (used only on project.html) ----
  function enableGlobalTextScroll(){
    const box = document.querySelector('.contact-text');
    if(!box) return;
    // Scroll the text box when the wheel happens anywhere outside it
    window.addEventListener('wheel', (e)=>{
      if(e.target && e.target.closest && e.target.closest('.contact-text')) return;
      // Only vertical scroll forwarding
      if(typeof e.deltaY === 'number' && e.deltaY !== 0){
        box.scrollTop += e.deltaY;
      }
    }, {passive:true});
  }
  function getProjectSlug(){
    const h = location.hash || '';
    const raw = h.replace(/^#/, '');
    const path = raw.split('?')[0] || '';
    let slug = '';
    if(path.startsWith('/projects/')) slug = path.slice('/projects/'.length);
    else slug = path.replace(/^\//, '').split('/')[0];
    try { return decodeURIComponent(slug || ''); } catch { return slug || ''; }
  }

  function restoreProjectSnapshot(){
    try{
      const wrap = document.querySelector('.contact-wrap');
      if(!wrap) return;
      const body = document.body || document.querySelector('body');
      const isContactPage = !!(body && body.classList.contains('contact-page'));
      const existing = document.querySelector('.project-temp-layer');
      if(existing) existing.remove();
      const layer = buildSnapshotLayer();
      if(!layer) return;
      layer.dataset.snapshotRole = 'project';
      wrap.parentNode.insertBefore(layer, wrap);
      // On contact page keep the snapshot layer persistent; no listeners/timeouts
      if(isContactPage) return;
      let cleaned = false;
      const cleanup = ()=>{
        if(cleaned) return;
        // On contact page, keep the snapshot layer present under the panel
        // so the home remains visible during closing sweep.
        if(isContactPage) return;
        if(wrap.classList.contains('closing')){
          wrap.removeEventListener('animationend', onEnd);
          return;
        }
        cleaned = true;
        layer.remove();
        wrap.removeEventListener('animationend', onEnd);
      };
      const onEnd = (ev)=>{
        if(ev && ev.target !== wrap) return;
        cleanup();
      };
      wrap.addEventListener('animationend', onEnd);
  const total = animationTotalDuration(wrap);
  const buffer = 200;
  const wait = total > 0 ? total : 0;
  setTimeout(cleanup, wait + buffer);
    }catch(_e){}
  }

  function showHomeSnapshot(){
    try{
      const body = document.body || document.querySelector('body');
      if(!body) return null;
      const layer = buildSnapshotLayer();
      if(!layer) return null;
      layer.dataset.snapshotRole = 'home';
      body.insertBefore(layer, body.firstChild);
      return layer;
    }catch(_e){ return null; }
  }

  function removeHomeSnapshotLayer(){
    if(homeSnapshotLayer){
      homeSnapshotLayer.remove();
      homeSnapshotLayer = null;
      return;
    }
    const leftover = document.querySelector('.project-temp-layer[data-snapshot-role="home"]');
    if(leftover) leftover.remove();
  }
  async function loadProjectPage(){
    restoreProjectSnapshot();
    const wrap = document.querySelector('.contact-wrap');
    if(wrap) wrap.classList.remove('closing');
    const slug = getProjectSlug();
    if(!slug) return;
    try{
      const res = await fetch('assets/projects.json', {cache:'no-store'});
      if(!res.ok) throw new Error('Failed to load projects.json');
      const data = await res.json();
      if(!Array.isArray(data)) throw new Error('Invalid data');
      const p = data.find(pr => pr && pr.id === slug);
      if(!p) return;
      const backLink = document.querySelector('.back');
      if(backLink && p.id){ backLink.setAttribute('href', `/#${encodeURIComponent(p.id)}`); }
      const descEl = document.getElementById('project-description-long');
      if(descEl){
        const raw = p.longDescription || p.description || '';
        if(raw){
          // Keep paragraph breaks (double newlines). Preserve single newlines (do NOT collapse to spaces) to mimic contact page wrapping.
          const paragraphs = raw.replace(/\r/g,'').split(/\n\s*\n+/).map(s=>s.replace(/\s+$/,'')).filter(s=>s.trim().length);
          descEl.innerHTML = paragraphs.map(par=>{
            const escaped = par
              .replace(/&/g,'&amp;')
              .replace(/</g,'&lt;')
              .replace(/>/g,'&gt;');
            // Replace single newlines with <br> only if they were explicit (retain spacing consistency with contact page source)
            return '<p>' + escaped.replace(/\n/g,'<br>') + '</p>';
          }).join('');
        } else { descEl.textContent=''; }
      }
      // Link rendering: only behave as a link if the value looks like a real URL
      const l = document.getElementById('project-link');
      const rawLink = String(p.link || '').trim();
      const rawText = String(p.linkText || '').trim();
      function isLikelyUrl(str){
        if(!str) return false;
        const s = String(str).trim();
        const lower = s.toLowerCase();
        if(lower === 'none' || lower === '-' || lower === '—') return false;
        // Accept http(s) URLs that parse and contain a dot in the hostname
        if(/^https?:\/\//i.test(s)){
          try{ const u = new URL(s); return /\./.test(u.hostname) && !/\s/.test(s); }catch{ return false; }
        }
        // Accept bare domains like "www.domain.com" or "domain.es"
        if(/^www\.[^\s]+\.[a-z]{2,}$/i.test(s)) return true;
        if(/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.+)?$/i.test(s)) return true;
        return false;
      }
      if(l){
        if(isLikelyUrl(rawLink)){
          const href = /^https?:\/\//i.test(rawLink) ? rawLink : ('https://' + rawLink);
          const hasCurated = rawText && rawText !== '-' && rawText !== '—';
          const fallbackHost = (function(){ try{ const u=new URL(href); return u.hostname.replace(/^www\./,''); }catch{ return rawLink; } })();
          const label = hasCurated ? rawText : fallbackHost;
          l.setAttribute('href', href);
          l.setAttribute('target', '_blank');
          l.setAttribute('rel', 'noopener');
          l.textContent = label;
        } else {
          // Replace the anchor with plain text so it doesn't behave like a link
          const parent = l.parentElement;
          const text = rawText && rawText !== '-' && rawText !== '—' ? rawText : '—';
          if(parent){
            const span = document.createElement('span');
            span.id = 'project-link';
            span.textContent = text;
            parent.replaceChild(span, l);
          } else {
            // Fallback: strip link behavior
            l.removeAttribute('href');
            l.removeAttribute('target');
            l.removeAttribute('rel');
            l.textContent = text;
            l.style.pointerEvents = 'none';
          }
        }
      }
      const dur = document.getElementById('project-duration');
      if(dur && p.duration){ dur.textContent = p.duration; }
      const costEl = document.getElementById('project-cost');
      if(costEl && p.cost){ costEl.textContent = p.cost; }
      if(p.title){ document.title = p.title + ' — MENÉNDEZ MORRO'; }
      // After injecting description, build visual line reveal wrappers (no resize reflow)
      setupLongTextLineReveal();
      await setupProjectUIReveal();
    }catch(_e){ /* keep placeholders on error */ }
  }

  const earlyBody = document.body || document.querySelector('body');
  if(earlyBody && (earlyBody.classList.contains('project-page') || earlyBody.classList.contains('contact-page'))){
    restoreProjectSnapshot();
  }

  // Track if init has been called to prevent duplicate initialization
  let initCalled = false;

  // Start
  document.addEventListener('DOMContentLoaded', ()=>{
    const body = document.body || document.querySelector('body');
    const isProjectPage = body && body.classList.contains('project-page');
    const isContactPage = body && body.classList.contains('contact-page');
    if(isProjectPage){
      window.addEventListener('hashchange', loadProjectPage);
      loadProjectPage();
      enableGlobalTextScroll();
      const wrap = document.querySelector('.contact-wrap');
      const backLink = document.querySelector('.back');
      if(wrap && backLink && !backLink.dataset.closingBound){
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        backLink.addEventListener('click', (event)=>{
          if(event.defaultPrevented) return;
          if(typeof event.button === 'number' && event.button !== 0) return;
          if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const targetUrl = backLink.href;
          if(motionQuery.matches){
            location.href = targetUrl;
            return;
          }
          if(wrap.classList.contains('closing')) return;
          restoreProjectSnapshot();
          wrap.classList.remove('closing');
          void wrap.offsetWidth;
          wrap.classList.add('closing');
          let fallback = null;
          const onDone = (ev)=>{
            if(ev){
              if(ev.target !== wrap) return;
              if(ev.animationName && ev.animationName !== 'project-bg-close') return;
            }
            wrap.removeEventListener('animationend', onDone);
            if(fallback !== null) clearTimeout(fallback);
            location.href = targetUrl;
          };
          wrap.addEventListener('animationend', onDone);
          const duration = animationTotalDuration(wrap);
          const fallbackBuffer = 80;
          const fallbackDelay = (duration > 0 ? duration : 0) + fallbackBuffer;
          fallback = setTimeout(()=> onDone(), fallbackDelay);
        });
        backLink.dataset.closingBound = 'true';
      }
    } else if(isContactPage){
      enableGlobalTextScroll();
      // Bind closing sweep for contact page back navigation (reuse project close keyframes)
      const back = document.querySelector('.back');
      const wrap = document.querySelector('.contact-wrap');
      // Point back link to the same project that was active when opening contact
      const savedId = sessionStorage.getItem('projectId');
      if(back && savedId){ back.setAttribute('href', `/#${encodeURIComponent(savedId)}`); }
      // Ensure snapshot layer present if early restoration missed (defensive)
      if(back && wrap && !back.dataset.closingBound){
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        back.addEventListener('click', (event)=>{
          if(event.defaultPrevented) return;
          if(typeof event.button === 'number' && event.button !== 0) return;
          if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // allow open in new tab, etc
          event.preventDefault();
          const targetUrl = back.href || 'index.html';
          if(motionQuery.matches){ location.href = targetUrl; return; }
          if(wrap.classList.contains('closing')) return;
          // Rebuild snapshot layer right before closing to ensure it's present underneath
          wrap.classList.remove('closing'); // ensure clean state
          void wrap.offsetWidth; // force reflow
          wrap.classList.add('closing'); // triggers contact-bg-close (bottom->top)
          let fallback = null;
          const onDone = (ev)=>{
            if(ev && ev.target !== wrap) return;
            if(ev && ev.animationName && ev.animationName !== 'contact-bg-close') return;
            wrap.removeEventListener('animationend', onDone);
            if(fallback){ clearTimeout(fallback); }
            location.href = targetUrl;
          };
          wrap.addEventListener('animationend', onDone);
          const duration = (function(){
            const d = animationTotalDuration(wrap);
            return d > 0 ? d : 1000; // fallback to root duration
          })();
          fallback = setTimeout(onDone, duration + 80);
        });
        back.dataset.closingBound = 'true';
      }
  // Build line reveal wrappers for contact text and CTA
  setupLongTextLineReveal();
  setupProjectUIReveal();
    } else {
      if(!initCalled) {
        initCalled = true;
        initPreloader();
        init();
      }
    }
  });

  // ---- Project page: Phase-based UI reveal helpers ----
  async function setupProjectUIReveal(){
    try{
      const body = document.body || document.querySelector('body');
      if(!body) return;
      const isProject = body.classList.contains('project-page');
      const isContact = body.classList.contains('contact-page');
      if(!isProject && !isContact) return;
      const wrap = document.querySelector('.contact-wrap');
      if(!wrap) return;

      const motionReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      const cta = document.querySelector('.contact-cta');
  const infoTitles = isProject ? Array.from(document.querySelectorAll('.project-info .info-title')) : [];
  const infoValues = isProject ? Array.from(document.querySelectorAll('.project-info .info-value')) : [];

      if(motionReduce.matches){
        return;
      }

      if(document.fonts && document.fonts.ready){ try{ await document.fonts.ready; }catch(_e){} }
      if(cta) wrapForReveal(cta);
      infoTitles.forEach(el=> wrapForReveal(el));
      infoValues.forEach(el=> wrapForReveal(el));
  const UI_NEAR_END_MS = 40; // retain existing timing reference for other UI (CTA/info)
      const CTA_OFFSET_MS = 200;
      const INFO_TITLE_STEP_MS = 35;
      const INFO_VALUE_STEP_MS = 35;
      const INFO_GROUP_GAP_MS = 60;

      const D = animationTotalDuration(wrap);
      const uiStart = Math.max(0, D > 0 ? (D - UI_NEAR_END_MS) : 0);
      setTimeout(()=>{
        if(cta){
          const ctaClip = cta.querySelector('.reveal-line-clip');
          if(ctaClip){ setTimeout(()=> ctaClip.classList.add('reveal-in'), CTA_OFFSET_MS); }
        }
        const seq = [...infoTitles, ...infoValues];
        let t = CTA_OFFSET_MS + 120; // unchanged sequence timing
        seq.forEach((el, i)=>{
          const clip = el.querySelector('.reveal-line-clip');
          if(!clip) return;
          setTimeout(()=> clip.classList.add('reveal-in'), t);
          if(i < infoTitles.length - 1){ t += INFO_TITLE_STEP_MS; }
          else if(i === infoTitles.length - 1){ t += INFO_GROUP_GAP_MS; }
          else { t += INFO_VALUE_STEP_MS; }
        });
      }, uiStart);
    }catch(_e){ /* ignore */ }
  }

  // ---- Project page: Long text reveal (line-by-line, preserving natural wrapping) ----
  function setupLongTextLineReveal(){
    try{
      const body = document.body || document.querySelector('body');
      if(!body) return;
      const isProject = body.classList.contains('project-page');
      const isContact = body.classList.contains('contact-page');
      if(!isProject && !isContact) return;
      const wrap = document.querySelector('.contact-wrap');
      const container = document.querySelector('.contact-text');
      // For project page we target #project-description-long; for contact page we animate existing paragraphs in .contact-text
      const descEl = isProject ? document.getElementById('project-description-long') : container;
      if(!wrap || !container || !descEl) return;
      const motionReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      if(motionReduce.matches) return;
      // Wrap display words for animation without changing flow.
      const paragraphs = Array.from(descEl.querySelectorAll('p'));
      paragraphs.forEach(p=>{
        const original = p.innerHTML;
        const tokens = [];
        p.childNodes.forEach(n=>{
          if(n.nodeType === 3){
            n.textContent.split(/(\s+)/).forEach(t=>{ if(t) tokens.push({type:/\s+/.test(t)?'space':'word', value:t}); });
          } else if(n.nodeName === 'BR'){ tokens.push({type:'br'}); }
        });
        while(p.firstChild) p.removeChild(p.firstChild);
        tokens.forEach(t=>{
          if(t.type === 'space') p.appendChild(document.createTextNode(' '));
          else if(t.type === 'br') p.appendChild(document.createElement('br'));
          else {
            const clip = document.createElement('span'); clip.className='reveal-line-clip';
            const inner = document.createElement('span'); inner.className='reveal-line'; inner.textContent = t.value;
            clip.appendChild(inner); p.appendChild(clip);
          }
        });
      });
      const clips = Array.from(descEl.querySelectorAll('.reveal-line-clip'));
      // Group clips into lines by top
      const lines = [];
      const TOL=1;
      clips.forEach(c=>{
        const r=c.getBoundingClientRect();
        const top=r.top;
        let line=lines.find(l=>Math.abs(l.top-top)<=TOL);
        if(!line){ line={top, clips:[]}; lines.push(line); }
        line.clips.push(c);
      });
      lines.sort((a,b)=>a.top-b.top);
      const revealed=new Set();
      const STAGGER=35;
      const BATCH_GAP=80;
      let batch=[]; let batchTimer=null; let sweepDone=false;
      function flush(){ if(!batch.length) return; let d=0; batch.forEach(line=>{ line.clips.forEach(c=>{ c.classList.add('reveal-in'); c.querySelector('.reveal-line').style.setProperty('--delay', d+'ms'); }); revealed.add(line.top); d+=STAGGER; }); batch=[]; }
      function queue(line){ if(revealed.has(line.top)) return; batch.push(line); if(batchTimer) clearTimeout(batchTimer); batchTimer=setTimeout(()=>{flush(); batchTimer=null;}, BATCH_GAP); }
      const io=new IntersectionObserver(entries=>{ if(!sweepDone) return; entries.forEach(e=>{ if(e.isIntersecting){ const top=e.target.__ltTop; const line=lines.find(l=>l.top===top); if(line) queue(line); } }); }, {root:container, threshold:0.01});
      lines.forEach(l=>{ const first=l.clips[0]; if(first){ first.__ltTop=l.top; io.observe(first); } });

      // Sweep duration fallback
      function parseMs(v){ if(!v) return 0; const s=String(v).trim(); if(s.endsWith('ms')) return parseFloat(s)||0; if(s.endsWith('s')) return (parseFloat(s)||0)*1000; return parseFloat(s)||0; }
      let sweepDuration = animationTotalDuration(wrap);
      if(sweepDuration < 50){
        try{ const rootStyle = getComputedStyle(document.documentElement); sweepDuration = parseMs(rootStyle.getPropertyValue('--project-sweep-duration')); }catch(_e){ sweepDuration = 1000; }
      }
      const SWEEP_BUFFER_MS = 40;
      setTimeout(()=>{
        const cRect=container.getBoundingClientRect();
        const initial=lines.filter(l=>{ const fr=l.clips[0].getBoundingClientRect(); return fr.bottom>=cRect.top && fr.top<=cRect.bottom; });
        let d=0; initial.forEach(l=>{ l.clips.forEach(c=>{ c.classList.add('reveal-in'); c.querySelector('.reveal-line').style.setProperty('--delay', d+'ms'); }); revealed.add(l.top); d+=STAGGER; });
        sweepDone = true;
      }, sweepDuration + SWEEP_BUFFER_MS);
    }catch(_e){ /* ignore */ }
  }

  function wrapForReveal(el){
    if(!el || el.querySelector(':scope > .reveal-line-clip')) return;
    const clip = document.createElement('span');
    clip.className = 'reveal-line-clip';
    const inner = document.createElement('span');
    inner.className = 'reveal-line';
    while(el.firstChild){ inner.appendChild(el.firstChild); }
    clip.appendChild(inner);
    el.appendChild(clip);
  }

  // Mobile menu staged reveal after sweep completes
  function setupMobileMenuReveal(){
    try{
      const motionReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      if(motionReduce.matches) return; // show instantly
      // Avoid duplicate wrapping on repeated opens
      const items = Array.from(mobileMenu.querySelectorAll('.mobile-nav .mobile-item, .mobile-nav .mobile-contact'));
      const footer = mobileMenu.querySelector('.mobile-footer');
      // Ensure logo has no reveal wrapper so it appears with the sweep
      const logoLink = mobileMenu.querySelector('.mobile-menu-header .logo');
      if(logoLink){
        const clip = logoLink.querySelector(':scope > .reveal-line-clip');
        if(clip){
          const inner = clip.querySelector('.reveal-line');
          if(inner){
            // move children back to the logo element
            while(inner.firstChild){ logoLink.appendChild(inner.firstChild); }
          }
          clip.remove();
        }
      }
      items.forEach(i=>wrapForReveal(i));
      if(footer) wrapForReveal(footer);
      // Reset reveal state on open
      const allClips = mobileMenu.querySelectorAll('.reveal-line-clip');
      allClips.forEach(c=> c.classList.remove('reveal-in'));
      const allItems = mobileMenu.querySelectorAll('.mobile-nav .mobile-item');
      allItems.forEach(it=> it.classList.remove('mm-revealed'));
      // Determine sweep duration from computed animation of mobileMenu
      let sweepDuration = animationTotalDuration(mobileMenu);
      if(!sweepDuration || sweepDuration < 50){ sweepDuration = 1000; }
      // Earlier reveals: begin before sweep fully finishes.
      // Use a ratio of the sweep duration so timing adapts if CSS changes.
      const REVEAL_START_RATIO = 0.72; // start at ~72% of sweep progress (earlier than previous 100%)
      const BASE_START = Math.round(sweepDuration * REVEAL_START_RATIO);
      const ITEM_STAGGER = 70; // slightly tighter stagger for a snappier feel
      const LOGO_EXTRA = 20; // small extra delay after logo for first item
      const FOOTER_EXTRA = 140; // footer after items
      items.forEach((it, idx)=>{
        const clip = it.querySelector('.reveal-line-clip');
        if(!clip) return;
        const delay = BASE_START + LOGO_EXTRA + ITEM_STAGGER * idx;
        mobileRevealTimers.push(setTimeout(()=>{
          clip.classList.add('reveal-in');
          if(it.classList) it.classList.add('mm-revealed');
        }, delay));
      });
      if(footer){
        const fClip = footer.querySelector('.reveal-line-clip');
        if(fClip){
          const totalItems = items.length;
          const footerDelay = BASE_START + LOGO_EXTRA + ITEM_STAGGER * totalItems + FOOTER_EXTRA;
          mobileRevealTimers.push(setTimeout(()=> fClip.classList.add('reveal-in'), footerDelay));
        }
      }
    }catch(_e){ /* ignore */ }
  }

})();