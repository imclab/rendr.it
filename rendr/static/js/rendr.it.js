/*!
Copyright (C) 2012 TaguchiMarketing Pty Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(function($) {
    // From http://stackoverflow.com/questions/985272/jquery-selecting-text-in-an-element-akin-to-highlighting-with-your-mouse/987376#987376
    function selectText(element) {
        var doc = document, range, selection;
        if (doc.body.createTextRange) { //ms
            range = doc.body.createTextRange();
            range.moveToElementText(element);
            range.select();
        } else if (window.getSelection) { //all others
            selection = window.getSelection();
            range = doc.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    // Return str + ch if str does not end in ch, or str otherwise
    function stringWithLastChar(str, ch) {
        if (str.charAt(str.length - 1) != ch) {
            return str + ch;
        } else {
            return str;
        }
    }

    // Return str[0:-1] if str ends in ch, or str otherwise
    function stringWithoutLastChar(str, ch) {
        if (str.charAt(str.length - 1) == ch) {
            return str.slice(0, -1);
        } else {
            return str;
        }
    }

    // Internal methods and state
    var rendr = {
        // State
        viewState: {
            library: null,
            rendr: null,
            theme: 'light',
            previewMode: 'live'
        },

        // Convert a query string to a list of parameters
        parseQuery: function(query) {
            var params = {},
                pairs = query.substring(1).split('&'), p, i;
            for (i = 0; i < pairs.length; i++) {
                p = pairs[i].split('=');
                params[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
            }
            return params;
        },
        // Preview pane update options
        localPreview: function(html, css, params, qs, callback) {
            var startTs = new Date();

            // Replace the iframe itself, because some types of CSS import
            // kill load method.
            $("#preview iframe").replaceWith(
                "<iframe style='width:0;height:0'></iframe>");

            // Use setTimeout as the iframe doesn't get a document until
            // a little after it's added to the DOM
            setTimeout(function() {
                var $iframe = $("#preview iframe"),
                    doc = $iframe.contents()[0], content,
                    data = rendr.parseQuery("?" + qs);

                data.params = (params || '').split('/');

                content = Mustache.render(
                    "<html><head><style>{{{css}}}</style>" +
                    "<script>query = {{{query}}};window.decodeBase64UrlSafe" +
                    " = function (s) { s = s.replace(/-/g, '+').replace(" +
                    "/_/g, '/'); return decodeURIComponent(escape(atob(s " +
                    "))); };</script></head>" +
                    "<body style='margin:0;padding:0;overflow:hidden'>" +
                    "{{{html}}}</body></html>", {
                        css: Mustache.render(css, data),
                        html: Mustache.render(html, data),
                        query: JSON.stringify(data)
                    }
                );

                $iframe.load(function() {
                    var $body = $iframe.contents().find("html"),
                        w = $body.width(),
                        h = $body.height();

                    $iframe.css({
                        width: w + "px",
                        height: h + "px",
                        "margin-left": '-' + Math.round(w / 2) + "px",
                        "margin-top": '-' + Math.round(h / 2) + "px"
                    });

                    $('#preview .status .width').text(w);
                    $('#preview .status .height').text(h);
                    $('#preview .status .filesize').text('?');
                    $('#preview .status .rendertime').text("" +
                        ((new Date()).valueOf() - startTs.valueOf()) / 1000.0);

                    if (callback) {
                        callback($iframe.contents());
                    }
                });

                doc.open();
                doc.write(content);
                doc.close();
            }, 1);
        },
        renderPreview: function(params, qs, format) {
            var startTs = new Date();

            // Replace the iframe itself, because some types of CSS import
            // kill load method.
            $("#preview iframe").replaceWith(
                "<iframe style='width:0;height:0'></iframe>");

            // Use setTimeout as the iframe doesn't get a document until
            // a little after it's added to the DOM
            setTimeout(function() {
                var $iframe = $("#preview iframe"), content, url,
                    doc = $iframe.contents()[0];

                url = "/" + rendr.viewState.rendr.libraryId + "/" +
                    rendr.viewState.rendr.rendrId + "/" + params + "." +
                    format + "?" + qs;

                $iframe.load(function() {
                    var $body = $iframe.contents().find("html"),
                        w = $body.width(),
                        h = $body.height();

                    $iframe.css({
                        width: w + "px",
                        height: h + "px",
                        "margin-left": '-' + Math.round(w / 2) + "px",
                        "margin-top": '-' + Math.round(h / 2) + "px"
                    });

                    $('#preview .status .width').text(w);
                    $('#preview .status .height').text(h);
                    $('#preview .status .filesize').text('?');
                    $('#preview .status .rendertime').text("" +
                        ((new Date()).valueOf() - startTs.valueOf()) / 1000.0);
                });

                doc.open();
                doc.write("<html><head></head><body style='margin:0;pading:" +
                    "0;overflow:hidden'><img src='" + url +
                    "' style='display:block' /></body></html>");
                doc.close();
            }, 1);
        },
        // Synchronise the library menu with the current library
        updateLibraryMenu: function() {
            $("#library-menu ul").empty();
            if (rendr.viewState.library) {
                $("#library-menu").removeClass("disabled");
                $(".library-name").text(rendr.viewState.library.name);
                $(".btn-new-rendr").removeClass("disabled");
                $(".btn-save-rendr").addClass("disabled");

                $.each(rendr.viewState.library.rendrs || [], function(i, r) {
                    $("#library-menu ul").append(
                        $("<li><a href='#' class='action btn-load-rendr'></a></li>")
                            .find("a").text(r).end());
                });
            } else {
                $("#library-menu").addClass("disabled");
                $(".library-name").text("(No library loaded)");
                $(".btn-new-rendr").addClass("disabled");
                $(".btn-save-rendr").addClass("disabled");
            }
        },
        // Get the current code and redraw the preview -- installed as an ACE
        // change callback.
        codeChange: function() {
            if (!rendr.viewState.rendr) {
                return;
            }

            var currentHtml = rendr.htmlEditor.getSession().getValue(),
                currentCss = rendr.cssEditor.getSession().getValue();

            if (currentHtml != rendr.viewState.rendr.body ||
                    currentCss != rendr.viewState.rendr.css) {
                $(".btn-save-rendr").removeClass("disabled");
                $(".btn-rendered-preview").addClass("disabled");

                // switch to live mode, since the code has changed from the
                // saved version
                if (rendr.viewState.previewMode == 'rendered') {
                    $(".btn-live-preview").addClass("active");
                    $(".btn-rendered-preview").removeClass("active");

                    rendr.viewState.previewMode = 'live';
                }
            } else {
                $(".btn-save-rendr").addClass("disabled");
                $(".btn-rendered-preview").removeClass("disabled");
            }

            if (rendr.viewState.previewMode == 'live') {
                rendr.localPreview(currentHtml, currentCss,
                    $(".paramString").text(), $(".queryString").text());
            } else {
                rendr.renderPreview($(".paramString").text(),
                    $(".queryString").text(), 'png');
            }
        },
        // Synchronise current option selections and relevant classes with
        // the current options
        syncOptions: function() {
            var options = localStorage["options"];
            if (!options) {
                return;
            } else {
                options = JSON.parse(options);
            }

            // Sync all in one go
            $.each(options, function(key, value) {
                $("#options input[name=" + key + "]").each(function() {
                    if ($(this).val() != value) {
                        $(this).attr("checked", false);
                    } else {
                        $(this).attr("checked", true);
                    }
                });
            });

            // Update the CSS theme classes individually
            if (options.theme) {
                $("body").removeClass();
                $("body").addClass(options.theme);
            }
            if (options.gridTheme) {
                $("#preview").removeClass().css('background-color', '');
                if (options.gridTheme.match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)) {
                    $("#preview, #colour-swatch").css('background-color', options.gridTheme);
                    $("#colour, #preview-bgcolour").val(options.gridTheme);
                    $("#preview-bgcolour").attr("checked",true).closest('li').addClass('active');
                } else {
                    $("#preview").addClass("right_panel " + options.gridTheme);
                }
            }
        },

        // RPC wrappers
        newLibrary: function(libraryName, callback) {
            $.ajax({
                url: "/library/",
                type: "POST",
                data: {name: libraryName},
                success: function(response) {
                    rendr.viewState.library = response;
                    callback({status: "success"});
                },
                error: function(response) {
                    rendr.viewState.library = null;
                    callback({status: "error"});
                }
            });
        },
        loadLibrary: function(libraryId, libraryKey, callback) {
            $.ajax({
                url: "/library/" + libraryId,
                type: "GET",
                data: {key: libraryKey},
                success: function(response) {
                    rendr.viewState.library = response;
                    // library key isn't returned by the get library RPC
                    rendr.viewState.library.key = libraryKey;
                    callback({status: "success"});
                },
                error: function(response) {
                    rendr.viewState.library = null;
                    callback({status: "error"});
                }
            });
        },

        saveRendr: function(rendrId, css, html, callback) {
            $.ajax({
                url: "/rendr/" + rendr.viewState.library.libraryId + "/" + rendrId,
                type: "PUT",
                data: JSON.stringify({
                    libraryKey: rendr.viewState.library.key,
                    css: css,
                    body: html
                }),
                dataType: "json",
                success: function(response) {
                    rendr.viewState.rendr = response;
                    callback({status: "success"});
                },
                error: function(response) {
                    callback({status: "error"});
                }
            });
        },
        loadRendr: function(rendrId, callback) {
            $.ajax({
                url: "/" + rendr.viewState.library.libraryId + "/" + rendrId + ".json",
                type: "GET",
                success: function(response) {
                    rendr.viewState.rendr = response;
                    callback({status: "success"});
                },
                error: function(response) {
                    callback({status: "error"});
                }
            });
        },

        // UI action methods
        "btn-save-rendr": function(btn) {
            $(btn).addClass("disabled in-progress");

            rendr.saveRendr(
                rendr.viewState.rendr.rendrId,
                rendr.cssEditor.getSession().getValue(),
                rendr.htmlEditor.getSession().getValue(),
                function(result) {
                    $(btn).removeClass("in-progress");
                    if (result.status != "success") {
                        $("#save-rendr-error").reveal();
                    } else {
                        rendr.codeChange();
                    }
                }
            );
        },
        "btn-new-rendr": function(btn) {
            $("#new-rendr").reveal();
        },
        "btn-load-rendr": function(btn) {
            $(btn).parent().addClass("disabled in-progress");

            rendr.loadRendr(
                $(btn).text(),

                function(result) {
                    $(btn).parent().removeClass("disabled in-progress");

                    if (result.status == "success") {
                        rendr.cssEditor.getSession().setValue(rendr.viewState.rendr.css);
                        rendr.cssEditor.setReadOnly(false);
                        rendr.htmlEditor.getSession().setValue(rendr.viewState.rendr.body);
                        rendr.htmlEditor.setReadOnly(false);

                        // Set example URL here
                        $(".libraryId").text(rendr.viewState.rendr.libraryId);
                        $(".rendrId").text(rendr.viewState.rendr.rendrId);

                        rendr.codeChange();
                    } else {
                        $("#load-rendr-error").reveal();
                    }
                }
            );
        },

        "btn-live-preview": function(btn) {
            if (rendr.viewState.previewMode == "rendered") {
                $(".btn-live-preview").addClass("active");
                $(".btn-rendered-preview").removeClass("active");

                rendr.viewState.previewMode = "live";

                rendr.codeChange();
            }
        },
        "btn-rendered-preview": function(btn) {
            if (rendr.viewState.previewMode == "live") {
                $(".btn-rendered-preview").addClass("active");
                $(".btn-live-preview").removeClass("active");

                rendr.viewState.previewMode = "rendered";

                rendr.codeChange();
            }
        },

        "btn-load-library-submit": function(btn) {
            $(btn).addClass("disabled in-progress");

            rendr.loadLibrary(
                $("#load-library input[name=libraryId]").val(),
                $("#load-library input[name=libraryKey]").val(),

                function(result) {
                    $(btn).removeClass("disabled in-progress");
                    if (result.status == "success") {
                        $("#load-library").trigger("reveal:close");
                    } else {
                        $("#load-library .initial").hide();
                        $("#load-library .error").show();
                    }

                    rendr.updateLibraryMenu();
                }
            )
        },
        "btn-new-library-submit": function(btn) {
            $(btn).addClass("disabled in-progress");

            rendr.newLibrary(
                $("#new-library input[name=libraryName]").val(),

                function(result) {
                    $(btn).removeClass("disabled in-progress");
                    $("#new-library .initial").hide();

                    if (result.status == "success") {
                        $("#new-library .library-id").val(rendr.viewState.library.libraryId);
                        $("#new-library .secret-key").val(rendr.viewState.library.key);

                        $("#new-library .success").show();
                    } else {
                        $("#new-library .error").show();
                    }

                    rendr.updateLibraryMenu();
                }
            );
        },

        "btn-new-rendr-submit": function(btn) {
            var rendrId = $("#new-rendr input[name=rendrId]").val(),
                html, css;

            $(btn).addClass("disabled in-progress");

            if ($("#new-rendr input[name=contentSource]:checked").val() == "current") {
                css = rendr.cssEditor.getSession().getValue();
                html = rendr.htmlEditor.getSession().getValue();
            } else {
                css = "/* Rendr " + rendrId + ": CSS content */";
                html = "<!-- Rendr " + rendrId + ": HTML body content -->"
            }

            rendr.saveRendr(
                rendrId, css, html,
                function(result) {
                    $(btn).removeClass("disabled in-progress");
                    $("#new-rendr .initial").hide();

                    if (result.status == "success") {
                        rendr.cssEditor.getSession().setValue(rendr.viewState.rendr.css);
                        rendr.cssEditor.setReadOnly(false);
                        rendr.htmlEditor.getSession().setValue(rendr.viewState.rendr.body);
                        rendr.htmlEditor.setReadOnly(false);

                        // Set example URL
                        $(".libraryId").text(rendr.viewState.library.libraryId);
                        $(".rendrId").text(rendrId);

                        rendr.codeChange();

                        rendr.viewState.library.rendrs.push(rendrId);
                        rendr.updateLibraryMenu();

                        $("#new-rendr").trigger("reveal:close");
                    } else {
                        $("#new-rendr .error").show();
                    }
                }
            );
        },

        "btn-options-submit": function(btn) {
            localStorage["options"] = JSON.stringify({
                theme: $("#options input[name=theme]:checked").val(),
                gridTheme: $("#options input[name=gridTheme]:checked").val()
            });
            rendr.syncOptions();

            $("#options").trigger("reveal:close");
        }
    };
    window.rendr = rendr;

    // DOM/browser interfaces, event handlers, setup code

    // Layout elements get set up when document is ready, to minimize redraws
    $(document).ready(function () {
        /*
        CSS Browser Selector v0.4.0 (Nov 02, 2010)
        Rafael Lima (http://rafael.adm.br)
        http://rafael.adm.br/css_browser_selector
        License: http://creativecommons.org/licenses/by/2.5/
        Contributors: http://rafael.adm.br/css_browser_selector#contributors
        */
        function css_browser_selector(u) {
            var ua = u.toLowerCase(),
                is = function(t) {
                    return ua.indexOf(t) > -1
                }, g = 'gecko',
                w = 'webkit',
                s = 'safari',
                o = 'opera',
                m = 'mobile',
                h = document.documentElement,
                b = [(!(/opera|webtv/i.test(ua)) && /msie\s(\d)/.test(ua)) ? ('ie ie' + RegExp.$1) : is('firefox/2') ? g + ' ff2' : is('firefox/3.5') ? g + ' ff3 ff3_5' : is('firefox/3.6') ? g + ' ff3 ff3_6' : is('firefox/3') ? g + ' ff3' : is('firefox/') ? g + ' ff' + (/firefox\/(\d)/.test(ua) ? RegExp.$1 : '') : is('gecko/') ? g : is('opera') ? o + (/version\/(\d+)/.test(ua) ? ' ' + o + RegExp.$1 : (/opera(\s|\/)(\d+)/.test(ua) ? ' ' + o + RegExp.$2 : '')) : is('konqueror') ? 'konqueror' : is('blackberry') ? m + ' blackberry' : is('android') ? m + ' android' : is('chrome') ? w + ' chrome' : is('iron') ? w + ' iron' : is('applewebkit/') ? w + ' ' + s + (/version\/(\d+)/.test(ua) ? ' ' + s + RegExp.$1 : '') : is('mozilla/') ? g : '', is('j2me') ? m + ' j2me' : is('iphone') ? m + ' iphone' : is('ipod') ? m + ' ipod' : is('ipad') ? m + ' ipad' : is('mac') ? 'mac' : is('darwin') ? 'mac' : is('webtv') ? 'webtv' : is('win') ? 'win' + (is('windows nt 6.0') ? ' vista' : '') : is('freebsd') ? 'freebsd' : (is('x11') || is('linux')) ? 'linux' : '', 'js'];
            var c = b.join(' ');
            h.className += ' ' + c;
            return c
        }
        css_browser_selector(navigator.userAgent);

        // Set up splitters
        $('#editors').split({
            orientation: 'horizontal',
            limit: 20,
            position: '50%',
            onDrag: function() {
                rendr.cssEditor.resize();
                rendr.htmlEditor.resize();
            }
        });

        $('#content').split({
            orientation: 'vertical',
            limit: 20,
            position: '38%',
            onDrag: function() {
                rendr.cssEditor.resize();
                rendr.htmlEditor.resize();
            }
        });

        $(".hsplitter, .vsplitter").append("<span>...</span>");

        rendr.cssEditor = ace.edit("css");
        rendr.cssEditor.setTheme("ace/theme/rendr");
        rendr.cssEditor.getSession().setUseWorker(false);
        rendr.cssEditor.getSession().setMode("ace/mode/css");
        rendr.cssEditor.setReadOnly(true);

        rendr.htmlEditor = ace.edit("html");
        rendr.htmlEditor.setTheme("ace/theme/rendr");
        rendr.htmlEditor.getSession().setUseWorker(false);
        rendr.htmlEditor.getSession().setMode("ace/mode/html");
        rendr.htmlEditor.setReadOnly(true);

        $("#css").append('<div class="title">CSS</div>');
        $("#html").append('<div class="title">HTML</div>');

    });

    // Interactive elements get configured on window load
    $(window).load(function() {
        var debounceCodeChange = $.debounce(rendr.codeChange, 250);

        // Foundation setup
        $(document).foundationButtons();
        $(document).foundationCustomForms();
        $(document).foundationTabs({callback:$.foundation.customForms.appendCustomMarkup});

        // Set up tooltips
        $(document).find(".has-tooltip").each(function() {
            var e = $(this);
            e.tipsy({
                delayIn: 750,
                fade: true,
                offset: 10,
                gravity: e.hasClass("northwest") ? "nw" : e.hasClass("northeast") ? "ne" : e.hasClass("east") ? "e" : e.hasClass("west") ? "w" : e.hasClass("south") ? "s" : "n"
            });
        });

        // Re-render on each editor/query string change, at most 4x per sec
        rendr.cssEditor.getSession().on('change', debounceCodeChange);
        rendr.htmlEditor.getSession().on('change', debounceCodeChange);

        $(".paramString,.queryString").bind('textchange', debounceCodeChange);

        // Set up UI handler methods
        $(document).on("click", ".button, .action", function(e) {
            var self = this;

            // Abort if disabled
            if ($(this).hasClass("disabled")) {
                return false;
            }

            // For any btn-* classes, call the corresponding action method if
            // defined
            $.each($(this).attr("class").split(" "), function(i, cls) {
                if (cls.indexOf("btn-") === 0 && rendr[cls] !== undefined) {
                    rendr[cls](self);
                }
            });

            // For links etc, don't allow the default action
            e.preventDefault();
        });

        $(document).on("reveal:open", ".reveal-modal", function(e) {
            $(this).find('.initial').show();
            $(this).find('.success').hide();
            $(this).find('.error').hide();
        });

        $("#css, #html").hoverIntent(
            function(){
                $(this).find('.title').fadeOut('fast');
            },
            function(){
                $(this).find('.title').fadeIn('fast');
            }
        );

        // Set up methods to handle URL copying -- replace the contenteditable
        // bits with regular spans to allow proper selection
        $(".url").bind("mousedown", function(e) {
            if ($(e.target).hasClass("paramString") ||
                    $(e.target).hasClass("queryString")) {
                return true;
            }
            $(".paramString,.queryString").removeAttr("contenteditable");
            selectText($(".url")[0]);
            return false;
        });
        $("body").bind("mousedown", function(e) {
            if (!$(e.target).hasClass("url")) {
                $(".paramString,.queryString").attr("contenteditable", true);
            }
        });
        $(".paramString").bind("hastext", function() {
            $(this).prev().text(stringWithLastChar($(this).prev().text(), "/"));
        }).bind("notext", function() {
            $(this).prev().text(stringWithoutLastChar($(this).prev().text(), "/"));
        });
        $(".queryString").bind("hastext", function() {
            $(this).prev().text(stringWithLastChar($(this).prev().text(), "?"));
        }).bind("notext", function() {
            $(this).prev().text(stringWithoutLastChar($(this).prev().text(), "?"));
        });

        // Initialise colourpicker
        var $colourpicker = $.farbtastic("#colourpicker", {
            callback: function(color) {
                $('#colour, #preview-bgcolour').val(color);
                $('#colour-swatch').css('background-color', color);
            },
            width: 120
        });

        // Update colourpicker wheel from text input
        $('#colour').keyup(function(){
            var enteredcolour = $(this).val();
            var isHexColour = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

            $colourpicker.setColor(enteredcolour);
            $(this).css('color', isHexColour.test(enteredcolour) ? '#404040' : '#f00');
        });

        // Focus Colourpicker by clicking on either label or field
        $('#colour-swatch, #colour').click(function(){
            $('#preview-bgcolour').attr('checked', true);
            $(this).closest('li').addClass('active');
            $('#colourpicker').fadeIn();
            $colourpicker.setColor($('#preview-bgcolour').val());
        });

        // Hide colourpicker
        $("body").click(function(){
            $("#colourpicker").fadeOut().removeClass("active");
        });

        // Prevent colourpicker from closing on related elements
        $("#colourpicker, #colour, #colour-swatch, #preview-bgcolour").click(function(e) {
            e.stopPropagation();
        });

        // Remove colourpicker active class from list element
        $('#options input[name=gridTheme]').change(function() {
            $(this).closest('ul').children('li').removeClass('active');
        });

        $(".reveal-modal dd input").mouseup(function() {
            $(this).select();
        });

        // Sync options selections with current localStorage value
        rendr.syncOptions();

        // Render the initial content
        rendr.localPreview(rendr.htmlEditor.getSession().getValue(),
            rendr.cssEditor.getSession().getValue(), "", "",
            function(doc) {
                $(doc).find("a[data-reveal-id]").click(function(e) {
                    $('#' + $(this).attr("data-reveal-id")).reveal($(this).data());
                    return false;
                });
            }
        );
    });
})(jQuery);
