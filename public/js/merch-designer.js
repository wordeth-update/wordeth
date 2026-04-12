var MerchDesigner = (function() {
    var PRODUCTS = [
        { id: 'tshirt', name: 'T-Shirt', icon: 'fa-tshirt', basePrice: 29.99,
          pct: { front: { top: 25, left: 22, width: 56, height: 38 }, back: { top: 25, left: 22, width: 56, height: 38 }, left: { top: 28, left: 15, width: 25, height: 35 }, right: { top: 28, left: 60, width: 25, height: 35 } } },
        { id: 'hoodie', name: 'Hoodie', icon: 'fa-tshirt', basePrice: 54.99,
          pct: { front: { top: 32, left: 24, width: 52, height: 30 }, back: { top: 28, left: 24, width: 52, height: 34 }, left: { top: 30, left: 12, width: 28, height: 32 }, right: { top: 30, left: 60, width: 28, height: 32 } } },
        { id: 'tank', name: 'Tank Top', icon: 'fa-tshirt', basePrice: 24.99,
          pct: { front: { top: 22, left: 22, width: 56, height: 40 }, back: { top: 22, left: 22, width: 56, height: 40 } } },
        { id: 'longsleeve', name: 'Long Sleeve', icon: 'fa-tshirt', basePrice: 34.99,
          pct: { front: { top: 25, left: 22, width: 56, height: 38 }, back: { top: 25, left: 22, width: 56, height: 38 }, left: { top: 28, left: 10, width: 22, height: 38 }, right: { top: 28, left: 68, width: 22, height: 38 } } },
        { id: 'sweatshirt', name: 'Sweatshirt', icon: 'fa-tshirt', basePrice: 44.99,
          pct: { front: { top: 28, left: 24, width: 52, height: 34 }, back: { top: 26, left: 24, width: 52, height: 36 }, left: { top: 30, left: 12, width: 28, height: 32 }, right: { top: 30, left: 60, width: 28, height: 32 } } },
        { id: 'hat', name: 'Cap', icon: 'fa-hat-cowboy-side', basePrice: 24.99,
          pct: { front: { top: 18, left: 25, width: 50, height: 35 }, back: { top: 18, left: 25, width: 50, height: 35 }, left: { top: 20, left: 10, width: 35, height: 35 }, right: { top: 20, left: 55, width: 35, height: 35 } } }
    ];

    var COLORS = [
        { id: 'black', hex: '#1a1a1a', name: 'Black', filter: 'brightness(0.22)' },
        { id: 'white', hex: '#f5f5f5', name: 'White', filter: 'none' },
        { id: 'navy', hex: '#1b2838', name: 'Navy', filter: 'brightness(0.22) sepia(1) hue-rotate(180deg) saturate(3)' },
        { id: 'gray', hex: '#6b7280', name: 'Gray', filter: 'brightness(0.55) saturate(0.1)' },
        { id: 'forest', hex: '#1a472a', name: 'Forest', filter: 'brightness(0.25) sepia(1) hue-rotate(80deg) saturate(4)' },
        { id: 'burgundy', hex: '#6b1c2a', name: 'Burgundy', filter: 'brightness(0.28) sepia(1) hue-rotate(320deg) saturate(4)' },
        { id: 'sand', hex: '#c2b280', name: 'Sand', filter: 'brightness(0.82) sepia(0.4) saturate(0.8)' },
        { id: 'slate', hex: '#3d4f5f', name: 'Slate', filter: 'brightness(0.38) sepia(1) hue-rotate(170deg) saturate(1.5)' }
    ];

    var SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

    var TEXT_COLORS = ['#ffffff', '#000000', '#00ffa3', '#ff4444', '#ffd700', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6'];

    var FONTS = [
        'Inter', 'Arial', 'Georgia', 'Courier New', 'Impact', 'Comic Sans MS',
        'Trebuchet MS', 'Verdana', 'Palatino', 'Garamond'
    ];

    var state = {
        product: PRODUCTS[0],
        color: COLORS[0],
        size: 'M',
        qty: 1,
        canvas: null,
        artist: null,
        view: 'front',
        frontObjects: [],
        backObjects: [],
        leftObjects: [],
        rightObjects: [],
        initialized: false
    };

    var VIEWS_BY_PRODUCT = {
        tshirt: ['front','back','left','right'],
        hoodie: ['front','back','left','right'],
        longsleeve: ['front','back','left','right'],
        sweatshirt: ['front','back','left','right'],
        hat: ['front','back','left','right'],
        tank: ['front','back']
    };

    function getImagePath(productId, view) {
        return 'images/merch/' + productId + '-' + view + '.png';
    }

    function init(artist) {
        state.artist = artist;
        state.view = 'front';
        state.frontObjects = [];
        state.backObjects = [];
        state.leftObjects = [];
        state.rightObjects = [];
        state.qty = 1;
        state.product = PRODUCTS[0];
        state.color = COLORS[0];
        state.size = 'M';
        renderProductSelector();
        renderColorSwatches();
        renderSizeSelector();
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.renderAll();
        } else {
            initCanvas();
        }
        updateGarment();
        updateViewButtons();
        if (!state.initialized) {
            initTools();
            state.initialized = true;
        }
        updatePrice();
        checkForLyrics();
        document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.view === 'front');
        });
        var viewToggle = document.querySelector('.view-toggle');
        if (viewToggle) viewToggle.style.display = 'flex';
    }

    function renderProductSelector() {
        var grid = document.getElementById('productTypeGrid');
        if (!grid) return;
        grid.innerHTML = PRODUCTS.map(function(p) {
            return '<button class="product-type-btn' + (p.id === state.product.id ? ' active' : '') + '" data-product="' + p.id + '">'
                + '<img src="' + getImagePath(p.id, 'front') + '" class="product-type-thumb" alt="' + p.name + '">'
                + '<span>' + p.name + '</span></button>';
        }).join('');
        grid.querySelectorAll('.product-type-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var prod = PRODUCTS.find(function(p) { return p.id === btn.dataset.product; });
                if (prod) selectProduct(prod);
            });
        });
    }

    function selectProduct(product) {
        state.product = product;
        document.querySelectorAll('.product-type-btn').forEach(function(b) { b.classList.remove('active'); });
        var active = document.querySelector('.product-type-btn[data-product="' + product.id + '"]');
        if (active) active.classList.add('active');
        updateGarment();
        updatePrice();
        updateViewButtons();
        var views = VIEWS_BY_PRODUCT[product.id] || ['front','back'];
        if (views.indexOf(state.view) < 0) {
            switchView('front');
        }
    }

    function renderColorSwatches() {
        var wrap = document.getElementById('colorSwatches');
        if (!wrap) return;
        wrap.innerHTML = COLORS.map(function(c) {
            return '<div class="color-swatch' + (c.id === state.color.id ? ' active' : '') + '" data-color="' + c.id + '" style="background:' + c.hex + ';" title="' + c.name + '"></div>';
        }).join('');
        wrap.querySelectorAll('.color-swatch').forEach(function(sw) {
            sw.addEventListener('click', function() {
                var col = COLORS.find(function(c) { return c.id === sw.dataset.color; });
                if (col) selectColor(col);
            });
        });
    }

    function selectColor(color) {
        state.color = color;
        document.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
        var active = document.querySelector('.color-swatch[data-color="' + color.id + '"]');
        if (active) active.classList.add('active');
        applyColorTint();
    }

    function renderSizeSelector() {
        var wrap = document.getElementById('sizeGrid');
        if (!wrap) return;
        wrap.innerHTML = SIZES.map(function(s) {
            return '<button class="size-btn' + (s === state.size ? ' active' : '') + '" data-size="' + s + '">' + s + '</button>';
        }).join('');
        wrap.querySelectorAll('.size-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                state.size = btn.dataset.size;
                document.querySelectorAll('.size-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });
    }

    function updateGarment() {
        var img = document.getElementById('garmentMockupImg');
        if (!img) return;

        img.src = getImagePath(state.product.id, state.view);
        applyColorTint();
        positionCanvas();
    }

    function applyColorTint() {
        var img = document.getElementById('garmentMockupImg');
        if (!img) return;
        img.style.filter = state.color.filter;

        var preview = document.getElementById('garmentPreview');
        if (preview) {
            preview.style.background = '#ffffff';
        }

        var dashed = document.querySelector('.canvas-container-wrap');
        if (dashed) {
            var light = ['white', 'sand'].indexOf(state.color.id) !== -1;
            dashed.style.borderColor = light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)';
        }
    }

    function positionCanvas() {
        if (!state.canvas) return;
        var preview = document.getElementById('garmentPreview');
        var wrap = document.querySelector('.canvas-container-wrap');
        if (!preview || !wrap) return;

        var pa = state.product.pct[state.view] || state.product.pct.front;
        var previewW = preview.offsetWidth;
        var previewH = preview.offsetHeight;

        var canvasW = Math.round(previewW * pa.width / 100);
        var canvasH = Math.round(previewH * pa.height / 100);
        var canvasTop = Math.round(previewH * pa.top / 100);
        var canvasLeft = Math.round(previewW * pa.left / 100);

        state.canvas.setWidth(canvasW);
        state.canvas.setHeight(canvasH);
        wrap.style.width = canvasW + 'px';
        wrap.style.height = canvasH + 'px';
        wrap.style.top = canvasTop + 'px';
        wrap.style.left = canvasLeft + 'px';
        state.canvas.renderAll();
    }

    function initCanvas() {
        var canvasEl = document.getElementById('designCanvas');
        if (!canvasEl) return;
        state.canvas = new fabric.Canvas('designCanvas', {
            backgroundColor: 'transparent',
            selection: true,
            preserveObjectStacking: true
        });

        state.canvas.on('selection:created', onSelectionChange);
        state.canvas.on('selection:updated', onSelectionChange);
        state.canvas.on('selection:cleared', function() {
            document.getElementById('deleteSelectedBtn').classList.remove('delete-active');
            var sg = document.getElementById('liveSizeGroup');
            if (sg) sg.style.display = 'none';
        });

        window.addEventListener('resize', function() {
            if (document.getElementById('designerSection').classList.contains('active')) {
                positionCanvas();
            }
        });
    }

    function onSelectionChange() {
        document.getElementById('deleteSelectedBtn').classList.add('delete-active');
        var active = state.canvas.getActiveObject();
        var sg = document.getElementById('liveSizeGroup');
        if (sg) {
            if (active && active.type === 'textbox') {
                sg.style.display = 'block';
                var sr = document.getElementById('fontSizeRange');
                if (sr) sr.value = Math.round(active.fontSize);
                var sv = document.getElementById('liveSizeVal');
                if (sv) sv.textContent = Math.round(active.fontSize) + 'px';
            } else {
                sg.style.display = 'none';
            }
        }
    }

    function initTools() {
        document.querySelectorAll('.tools-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.tools-tab').forEach(function(t) { t.classList.remove('active'); });
                document.querySelectorAll('.tool-panel').forEach(function(p) { p.classList.remove('active'); });
                tab.classList.add('active');
                document.getElementById('toolPanel-' + tab.dataset.tool).classList.add('active');
            });
        });

        document.getElementById('addTextBtn').addEventListener('click', addText);

        document.getElementById('uploadArtInput').addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                fabric.Image.fromURL(ev.target.result, function(img) {
                    var cw = state.canvas.getWidth();
                    var ch = state.canvas.getHeight();
                    var scale = Math.min((cw * 0.8) / img.width, (ch * 0.6) / img.height, 1);
                    img.set({ scaleX: scale, scaleY: scale, left: cw * 0.1, top: ch * 0.1 });
                    state.canvas.add(img);
                    state.canvas.setActiveObject(img);
                    state.canvas.renderAll();
                });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        document.getElementById('uploadArtZone').addEventListener('click', function() {
            document.getElementById('uploadArtInput').click();
        });

        document.getElementById('deleteSelectedBtn').addEventListener('click', function() {
            var active = state.canvas.getActiveObject();
            if (active) {
                if (active.wdthIsTemplateElement) {
                    showToast('Template elements cannot be deleted');
                    return;
                }
                if (active.type === 'activeSelection') {
                    var removable = [];
                    active.forEachObject(function(obj) {
                        if (!obj.wdthIsTemplateElement) removable.push(obj);
                    });
                    if (removable.length === 0) { showToast('Template elements cannot be deleted'); return; }
                    state.canvas.discardActiveObject();
                    removable.forEach(function(obj) { state.canvas.remove(obj); });
                } else {
                    state.canvas.remove(active);
                }
                state.canvas.renderAll();
            }
        });

        document.getElementById('clearCanvasBtn').addEventListener('click', function() {
            var objs = state.canvas.getObjects();
            if (objs.length === 0) return;
            var userObjs = objs.filter(function(o) { return !o.wdthIsTemplateElement; });
            if (userObjs.length === 0) { showToast('No user elements to clear'); return; }
            if (confirm('Clear your design elements? Template elements will be kept.')) {
                userObjs.forEach(function(o) { state.canvas.remove(o); });
                state.canvas.renderAll();
            }
        });

        document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchView(btn.dataset.view);
            });
        });

        var qtyMinus = document.getElementById('qtyMinus');
        var qtyPlus = document.getElementById('qtyPlus');
        if (qtyMinus) qtyMinus.addEventListener('click', function() { if (state.qty > 1) { state.qty--; updatePrice(); } });
        if (qtyPlus) qtyPlus.addEventListener('click', function() { if (state.qty < 50) { state.qty++; updatePrice(); } });

        document.getElementById('orderBtn').addEventListener('click', submitOrder);

        document.getElementById('textColorPicker').innerHTML = TEXT_COLORS.map(function(c, i) {
            return '<div class="tool-color-btn' + (i === 0 ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + ';"></div>';
        }).join('');
        document.querySelectorAll('#textColorPicker .tool-color-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#textColorPicker .tool-color-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });

        var fontSelect = document.getElementById('fontSelect');
        if (fontSelect) {
            fontSelect.innerHTML = FONTS.map(function(f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');
        }

        var sizeRange = document.getElementById('fontSizeRange');
        if (sizeRange) {
            sizeRange.addEventListener('input', function() {
                var active = state.canvas.getActiveObject();
                if (!active || active.type !== 'textbox') return;
                var newSize = parseInt(this.value) || 24;
                active.set('fontSize', newSize);
                state.canvas.renderAll();
                var valEl = document.getElementById('liveSizeVal');
                if (valEl) valEl.textContent = newSize + 'px';
            });
        }

        if (document.getElementById('useLyricsDesignBtn')) {
            document.getElementById('useLyricsDesignBtn').addEventListener('click', function() {
                if (window.selectedLyrics) {
                    document.getElementById('textInput').value = window.selectedLyrics.substring(0, 200);
                    document.querySelectorAll('.tools-tab').forEach(function(t) { t.classList.remove('active'); });
                    document.querySelectorAll('.tool-panel').forEach(function(p) { p.classList.remove('active'); });
                    document.querySelector('.tools-tab[data-tool="text"]').classList.add('active');
                    document.getElementById('toolPanel-text').classList.add('active');
                }
            });
        }
    }

    function addText() {
        var input = document.getElementById('textInput');
        var text = input.value.trim();
        if (!text) return;

        var color = '#ffffff';
        var activeColor = document.querySelector('#textColorPicker .tool-color-btn.active');
        if (activeColor) color = activeColor.dataset.color;

        var font = document.getElementById('fontSelect').value || 'Inter';
        var size = 24;
        var cw = state.canvas.getWidth();

        var textObj = new fabric.Textbox(text, {
            left: 10,
            top: 10,
            width: cw - 20,
            fontFamily: font,
            fontSize: size,
            fill: color,
            textAlign: 'center',
            editable: true
        });

        state.canvas.add(textObj);
        state.canvas.setActiveObject(textObj);
        state.canvas.renderAll();
        input.value = '';
    }

    function getViewObjects(v) {
        if (v === 'front') return state.frontObjects;
        if (v === 'back') return state.backObjects;
        if (v === 'left') return state.leftObjects;
        if (v === 'right') return state.rightObjects;
        return [];
    }
    function setViewObjects(v, data) {
        if (v === 'front') state.frontObjects = data;
        else if (v === 'back') state.backObjects = data;
        else if (v === 'left') state.leftObjects = data;
        else if (v === 'right') state.rightObjects = data;
    }
    function getThumbDataURL(v) { return state[v + 'ThumbDataURL'] || null; }
    function setThumbDataURL(v, url) { state[v + 'ThumbDataURL'] = url; }

    function switchView(view) {
        if (view === state.view) return;

        var extraProps = ['wdthLockPosition','wdthLockContent','wdthLockFont','wdthLockColor','wdthElementName','wdthIsTemplateElement','wdthOriginalFont','wdthOriginalFill'];
        setViewObjects(state.view, state.canvas.toJSON(extraProps));
        if (state.canvas.getObjects().length > 0) {
            setThumbDataURL(state.view, state.canvas.toDataURL({ format: 'png', multiplier: 0.4 }));
        } else {
            setThumbDataURL(state.view, null);
        }

        state.view = view;
        document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.view === view);
        });

        var img = document.getElementById('garmentMockupImg');
        if (img) img.src = getImagePath(state.product.id, view);

        positionCanvas();

        var saved = getViewObjects(view);
        if (saved && saved.objects && saved.objects.length > 0) {
            state.canvas.loadFromJSON(saved, function() { applyLockEnforcement(); state.canvas.renderAll(); });
        } else {
            state.canvas.clear();
            state.canvas.renderAll();
        }

        updateOtherSideThumb();
    }

    function updateViewButtons() {
        var views = VIEWS_BY_PRODUCT[state.product.id] || ['front','back'];
        document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
            if (views.indexOf(b.dataset.view) >= 0) {
                b.style.display = '';
            } else {
                b.style.display = 'none';
            }
        });
    }

    function updateOtherSideThumb() {
        var thumbEl = document.getElementById('otherSideThumb');
        if (!thumbEl) return;

        var otherView = state.view === 'front' ? 'back' : 'front';
        var dataURL = getThumbDataURL(otherView);

        if (dataURL) {
            var garmentSrc = getImagePath(state.product.id, otherView);
            thumbEl.innerHTML = '<div class="thumb-label">' + otherView.charAt(0).toUpperCase() + otherView.slice(1) + '</div>'
                + '<div class="thumb-garment-wrap">'
                + '<img src="' + garmentSrc + '" class="thumb-garment" style="filter:' + state.color.filter + '">'
                + '<img src="' + dataURL + '" class="thumb-design">'
                + '</div>';
            thumbEl.style.display = 'block';
            thumbEl.onclick = function() { switchView(otherView); };
        } else {
            thumbEl.style.display = 'none';
        }
    }

    function updatePrice() {
        var total = (state.product.basePrice * state.qty).toFixed(2);
        var priceEl = document.getElementById('orderPrice');
        var qtyEl = document.getElementById('qtyValue');
        if (priceEl) priceEl.textContent = '$' + total;
        if (qtyEl) qtyEl.textContent = state.qty;
    }

    function checkForLyrics() {
        var params = new URLSearchParams(window.location.search);
        var lyrics = params.get('lyrics');
        if (lyrics) {
            window.selectedLyrics = decodeURIComponent(lyrics);
            var banner = document.getElementById('lyricsDesignBanner');
            if (banner) banner.style.display = 'block';
        }
    }

    function getDesignDataURL() {
        if (!state.canvas || state.canvas.getObjects().length === 0) return null;
        return state.canvas.toDataURL({ format: 'png', multiplier: 2 });
    }

    function submitOrder() {
        var btn = document.getElementById('orderBtn');
        var token = localStorage.getItem('authToken');
        if (!token) {
            showToast('Please sign in to place an order');
            return;
        }

        if (state.canvas.getObjects().length === 0) {
            showToast('Add a design before ordering');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        var extraProps = ['wdthLockPosition','wdthLockContent','wdthLockFont','wdthLockColor','wdthElementName','wdthIsTemplateElement','wdthOriginalFont','wdthOriginalFill'];
        setViewObjects(state.view, state.canvas.toJSON(extraProps));

        var designImage = getDesignDataURL();
        var base = typeof apiUrl === 'function' ? apiUrl('') : '';
        base = base.replace(/\/$/, '');

        var orderBody = {
            product: state.product.id,
            productName: state.product.name,
            color: state.color.id,
            colorName: state.color.name,
            size: state.size,
            quantity: state.qty,
            unitPrice: state.product.basePrice,
            totalPrice: state.product.basePrice * state.qty,
            artistName: state.artist ? state.artist.name : null,
            artistId: state.artist ? state.artist.id : null,
            frontDesign: JSON.stringify(state.frontObjects),
            backDesign: JSON.stringify(state.backObjects),
            designPreview: designImage
        };
        var views = VIEWS_BY_PRODUCT[state.product.id] || ['front','back'];
        if (views.indexOf('left') >= 0 && state.leftObjects && state.leftObjects.objects && state.leftObjects.objects.length > 0) {
            orderBody.leftDesign = JSON.stringify(state.leftObjects);
        }
        if (views.indexOf('right') >= 0 && state.rightObjects && state.rightObjects.objects && state.rightObjects.objects.length > 0) {
            orderBody.rightDesign = JSON.stringify(state.rightObjects);
        }

        fetch(base + '/api/merch/orders', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderBody)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shopping-bag"></i> Place Order';
            if (data.success) {
                showToast('Order placed! We\'ll notify you when it ships.');
                state.canvas.clear();
                state.canvas.renderAll();
                state.frontObjects = [];
                state.backObjects = [];
                state.leftObjects = [];
                state.rightObjects = [];
                state.qty = 1;
                updatePrice();
            } else {
                showToast(data.message || 'Order failed. Please try again.');
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shopping-bag"></i> Place Order';
            showToast('Connection error. Please try again.');
        });
    }

    function showToast(msg) {
        var existing = document.querySelector('.toast-msg');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.className = 'toast-msg';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 3000);
    }

    function loadTemplate(templateData) {
        if (!templateData) return;

        if (templateData.defaultProduct) {
            var prod = PRODUCTS.find(function(p) { return p.id === templateData.defaultProduct; });
            if (prod) selectProduct(prod);
        }
        if (templateData.defaultColor) {
            var col = COLORS.find(function(c) { return c.id === templateData.defaultColor; });
            if (col) selectColor(col);
        }

        var frontData = templateData.frontDesign;
        var backData = templateData.backDesign;

        if (frontData) {
            var frontObj = typeof frontData === 'string' ? JSON.parse(frontData) : frontData;
            state.view = 'front';
            document.querySelectorAll('.view-toggle-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.view === 'front'); });
            var img = document.getElementById('garmentMockupImg');
            if (img) img.src = getImagePath(state.product.id, 'front');
            state.canvas.loadFromJSON(frontObj, function() {
                state.canvas.getObjects().forEach(function(obj) { obj.wdthIsTemplateElement = true; });
                applyLockEnforcement();
                state.canvas.renderAll();
                var ep = ['wdthLockPosition','wdthLockContent','wdthLockFont','wdthLockColor','wdthElementName','wdthIsTemplateElement','wdthOriginalFont','wdthOriginalFill'];
                state.frontObjects = state.canvas.toJSON(ep);
            });
        }

        if (backData) {
            var backObj = typeof backData === 'string' ? JSON.parse(backData) : backData;
            state.backObjects = backObj;
        }

        if (templateData.leftDesign) {
            var leftObj = typeof templateData.leftDesign === 'string' ? JSON.parse(templateData.leftDesign) : templateData.leftDesign;
            state.leftObjects = leftObj;
        }
        if (templateData.rightDesign) {
            var rightObj = typeof templateData.rightDesign === 'string' ? JSON.parse(templateData.rightDesign) : templateData.rightDesign;
            state.rightObjects = rightObj;
        }

        showToast('Template loaded! Locked elements are protected.');
    }

    function applyLockEnforcement() {
        if (!state.canvas) return;
        state.canvas.getObjects().forEach(function(obj) {
            if (!obj.wdthIsTemplateElement) return;
            if (obj.wdthLockPosition) {
                obj.set({
                    lockMovementX: true,
                    lockMovementY: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    lockRotation: true,
                    hasControls: false,
                    hasBorders: true,
                    borderColor: '#f59e0b',
                    borderDashArray: [4, 3]
                });
            }
            if (obj.wdthLockContent && obj.type === 'textbox') {
                obj.set({ editable: false });
            }
            if (obj.wdthLockFont && obj.type === 'textbox') {
                obj.set({ wdthOriginalFont: obj.fontFamily });
            }
            if (obj.wdthLockColor) {
                obj.set({ wdthOriginalFill: obj.fill });
            }
        });
    }

    return { init: init, loadTemplate: loadTemplate };
})();
