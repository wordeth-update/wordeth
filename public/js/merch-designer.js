var MerchDesigner = (function() {
    var PRODUCTS = [
        { id: 'tshirt', name: 'T-Shirt', icon: 'fa-tshirt', basePrice: 29.99, printW: 200, printH: 250, printTop: 90, printLeft: 90 },
        { id: 'hoodie', name: 'Hoodie', icon: 'fa-vest-patches', basePrice: 54.99, printW: 180, printH: 220, printTop: 100, printLeft: 100 },
        { id: 'tank', name: 'Tank Top', icon: 'fa-shirt', basePrice: 24.99, printW: 180, printH: 230, printTop: 80, printLeft: 100 },
        { id: 'longsleeve', name: 'Long Sleeve', icon: 'fa-mitten', basePrice: 34.99, printW: 200, printH: 250, printTop: 90, printLeft: 90 },
        { id: 'sweatshirt', name: 'Sweatshirt', icon: 'fa-vest-patches', basePrice: 44.99, printW: 190, printH: 230, printTop: 95, printLeft: 95 },
        { id: 'hat', name: 'Cap', icon: 'fa-hat-cowboy', basePrice: 24.99, printW: 140, printH: 80, printTop: 50, printLeft: 120 }
    ];

    var COLORS = [
        { id: 'black', hex: '#1a1a1a', name: 'Black' },
        { id: 'white', hex: '#f5f5f5', name: 'White' },
        { id: 'navy', hex: '#1b2838', name: 'Navy' },
        { id: 'gray', hex: '#6b7280', name: 'Gray' },
        { id: 'forest', hex: '#1a472a', name: 'Forest' },
        { id: 'burgundy', hex: '#6b1c2a', name: 'Burgundy' },
        { id: 'sand', hex: '#c2b280', name: 'Sand' },
        { id: 'slate', hex: '#3d4f5f', name: 'Slate' }
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
        initialized: false
    };

    function init(artist) {
        state.artist = artist;
        state.view = 'front';
        state.frontObjects = [];
        state.backObjects = [];
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
            resizeCanvas();
            updateGarmentSVG();
        } else {
            initCanvas();
        }
        if (!state.initialized) {
            initTools();
            state.initialized = true;
        }
        updatePrice();
        checkForLyrics();
    }

    function renderProductSelector() {
        var grid = document.getElementById('productTypeGrid');
        if (!grid) return;
        grid.innerHTML = PRODUCTS.map(function(p) {
            return '<button class="product-type-btn' + (p.id === state.product.id ? ' active' : '') + '" data-product="' + p.id + '">'
                + '<i class="fas ' + p.icon + '"></i><span>' + p.name + '</span></button>';
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
        updateGarmentSVG();
        resizeCanvas();
        updatePrice();
        if (product.id === 'hat') {
            document.querySelector('.view-toggle').style.display = 'none';
        } else {
            document.querySelector('.view-toggle').style.display = 'flex';
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
        updateGarmentSVG();
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

    function getGarmentSVG(productId, fillColor) {
        var c = fillColor || '#1a1a1a';
        switch (productId) {
            case 'tshirt':
                return '<svg viewBox="0 0 380 420" xmlns="http://www.w3.org/2000/svg"><path d="M90 40 L50 80 L10 70 L30 140 L70 120 L70 400 L310 400 L310 120 L350 140 L370 70 L330 80 L290 40 Q250 10 190 10 Q130 10 90 40Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/></svg>';
            case 'hoodie':
                return '<svg viewBox="0 0 380 440" xmlns="http://www.w3.org/2000/svg"><path d="M100 50 L60 90 L10 80 L30 200 L80 180 L80 420 L300 420 L300 180 L350 200 L370 80 L320 90 L280 50 Q240 20 190 20 Q140 20 100 50Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/><path d="M150 20 Q155 60 190 80 Q225 60 230 20" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/><ellipse cx="190" cy="30" rx="40" ry="15" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/></svg>';
            case 'tank':
                return '<svg viewBox="0 0 380 420" xmlns="http://www.w3.org/2000/svg"><path d="M120 30 L100 50 L100 400 L280 400 L280 50 L260 30 Q230 5 190 5 Q150 5 120 30Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/></svg>';
            case 'longsleeve':
                return '<svg viewBox="0 0 420 440" xmlns="http://www.w3.org/2000/svg"><path d="M110 50 L60 90 L10 80 L5 360 L55 360 L60 180 L80 160 L80 420 L340 420 L340 160 L360 180 L365 360 L415 360 L410 80 L360 90 L310 50 Q270 20 210 20 Q150 20 110 50Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/></svg>';
            case 'sweatshirt':
                return '<svg viewBox="0 0 380 440" xmlns="http://www.w3.org/2000/svg"><path d="M100 55 L55 95 L10 85 L30 200 L75 180 L75 420 L305 420 L305 180 L350 200 L370 85 L325 95 L280 55 Q240 25 190 25 Q140 25 100 55Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/><line x1="190" y1="100" x2="190" y2="250" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/></svg>';
            case 'hat':
                return '<svg viewBox="0 0 380 260" xmlns="http://www.w3.org/2000/svg"><path d="M40 180 Q40 80 190 60 Q340 80 340 180 L340 200 L40 200Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/><path d="M20 200 L360 200 L380 220 L360 230 L20 230 L0 220Z" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2" opacity="0.85"/></svg>';
            default:
                return '<svg viewBox="0 0 380 420" xmlns="http://www.w3.org/2000/svg"><rect x="60" y="20" width="260" height="380" rx="20" fill="' + c + '" stroke="rgba(255,255,255,0.12)" stroke-width="2"/></svg>';
        }
    }

    function updateGarmentSVG() {
        var wrap = document.getElementById('garmentSVG');
        if (!wrap) return;
        wrap.innerHTML = getGarmentSVG(state.product.id, state.color.hex);
        var preview = document.getElementById('garmentPreview');
        if (preview) {
            var bgLum = getLuminance(state.color.hex);
            preview.style.background = bgLum > 0.3 ? 'linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 100%)' : 'linear-gradient(135deg, #2a2a3e 0%, #3d2b5e 100%)';
        }
    }

    function getLuminance(hex) {
        var r = parseInt(hex.slice(1, 3), 16) / 255;
        var g = parseInt(hex.slice(3, 5), 16) / 255;
        var b = parseInt(hex.slice(5, 7), 16) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    function initCanvas() {
        var canvasEl = document.getElementById('designCanvas');
        if (!canvasEl) return;
        state.canvas = new fabric.Canvas('designCanvas', {
            backgroundColor: 'transparent',
            selection: true,
            preserveObjectStacking: true
        });
        resizeCanvas();
        updateGarmentSVG();

        state.canvas.on('selection:created', onSelectionChange);
        state.canvas.on('selection:updated', onSelectionChange);
        state.canvas.on('selection:cleared', function() {
            document.getElementById('deleteSelectedBtn').classList.remove('delete-active');
        });
    }

    function onSelectionChange() {
        document.getElementById('deleteSelectedBtn').classList.add('delete-active');
    }

    function resizeCanvas() {
        if (!state.canvas) return;
        state.canvas.setWidth(state.product.printW);
        state.canvas.setHeight(state.product.printH);
        var wrap = document.querySelector('.canvas-container-wrap');
        if (wrap) {
            wrap.style.width = state.product.printW + 'px';
            wrap.style.height = state.product.printH + 'px';
            wrap.style.top = state.product.printTop + 'px';
            wrap.style.left = state.product.printLeft + 'px';
        }
        state.canvas.renderAll();
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
                    var scale = Math.min((state.product.printW * 0.8) / img.width, (state.product.printH * 0.6) / img.height, 1);
                    img.set({ scaleX: scale, scaleY: scale, left: 20, top: 20 });
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
                if (active.type === 'activeSelection') {
                    active.forEachObject(function(obj) { state.canvas.remove(obj); });
                    state.canvas.discardActiveObject();
                } else {
                    state.canvas.remove(active);
                }
                state.canvas.renderAll();
            }
        });

        document.getElementById('clearCanvasBtn').addEventListener('click', function() {
            if (state.canvas.getObjects().length === 0) return;
            if (confirm('Clear all design elements?')) {
                state.canvas.clear();
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
        var size = parseInt(document.getElementById('fontSizeRange').value) || 24;

        var textObj = new fabric.Textbox(text, {
            left: 10,
            top: 10,
            width: state.product.printW - 20,
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

    function switchView(view) {
        if (view === state.view) return;
        if (state.view === 'front') {
            state.frontObjects = state.canvas.toJSON();
        } else {
            state.backObjects = state.canvas.toJSON();
        }
        state.view = view;
        document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.view === view);
        });
        var saved = view === 'front' ? state.frontObjects : state.backObjects;
        if (saved && saved.objects && saved.objects.length > 0) {
            state.canvas.loadFromJSON(saved, function() { state.canvas.renderAll(); });
        } else {
            state.canvas.clear();
            state.canvas.renderAll();
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

        if (state.view === 'front') {
            state.frontObjects = state.canvas.toJSON();
        } else {
            state.backObjects = state.canvas.toJSON();
        }

        var designImage = getDesignDataURL();
        var base = typeof apiUrl === 'function' ? apiUrl('') : '';
        base = base.replace(/\/$/, '');

        fetch(base + '/api/merch/orders', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
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
            })
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

    return { init: init };
})();
