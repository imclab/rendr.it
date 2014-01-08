/*!
Copyright (C) 2012, 2013 TaguchiMarketing Pty Ltd

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

// Initialize angularJS rendr.it module
var RendrItMod = angular.module('RendrIt', []).config(['$interpolateProvider', function($interpolateProvider) {
  // Modify the interpolation symbol so as not to clash with Mustache templates
  // FIXME perhaps check if we can switch from Mustache to AngularJS
  // for rendr url query string interpolation?
  $interpolateProvider.startSymbol('((');
  $interpolateProvider.endSymbol('))');
}]);


(function($) {
  "use strict";

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


  // Convert a query string to a list of parameters
  function parseQuery(query) {
    var params = {},
        pairs = query.substring(1).split('&'), p, i;
    for (i = 0; i < pairs.length; i++) {
      p = pairs[i].split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
    }
    return params;
  }

  angular.element(document).ready(function() {
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
            return ua.indexOf(t) > -1;
          }, g = 'gecko',
          w = 'webkit',
          s = 'safari',
          o = 'opera',
          m = 'mobile',
          h = document.documentElement,
          b = [(!(/opera|webtv/i.test(ua)) && /msie\s(\d)/.test(ua)) ? ('ie ie' + RegExp.$1) : is('firefox/2') ? g + ' ff2' : is('firefox/3.5') ? g + ' ff3 ff3_5' : is('firefox/3.6') ? g + ' ff3 ff3_6' : is('firefox/3') ? g + ' ff3' : is('firefox/') ? g + ' ff' + (/firefox\/(\d)/.test(ua) ? RegExp.$1 : '') : is('gecko/') ? g : is('opera') ? o + (/version\/(\d+)/.test(ua) ? ' ' + o + RegExp.$1 : (/opera(\s|\/)(\d+)/.test(ua) ? ' ' + o + RegExp.$2 : '')) : is('konqueror') ? 'konqueror' : is('blackberry') ? m + ' blackberry' : is('android') ? m + ' android' : is('chrome') ? w + ' chrome' : is('iron') ? w + ' iron' : is('applewebkit/') ? w + ' ' + s + (/version\/(\d+)/.test(ua) ? ' ' + s + RegExp.$1 : '') : is('mozilla/') ? g : '', is('j2me') ? m + ' j2me' : is('iphone') ? m + ' iphone' : is('ipod') ? m + ' ipod' : is('ipad') ? m + ' ipad' : is('mac') ? 'mac' : is('darwin') ? 'mac' : is('webtv') ? 'webtv' : is('win') ? 'win' + (is('windows nt 6.0') ? ' vista' : '') : is('freebsd') ? 'freebsd' : (is('x11') || is('linux')) ? 'linux' : '', 'js'];
      var c = b.join(' ');
      h.className += ' ' + c;
      return c;
    }
    css_browser_selector(navigator.userAgent);

    // Bootstrap rendr.it angularJS module
    angular.bootstrap(document, ["RendrIt"]);
  });

  angular.element(window).load(function() {
    // Foundation setup
    var doc = angular.element(document);
    doc.foundationButtons();
    doc.foundationCustomForms();
    doc.foundationTabs({callback:$.foundation.customForms.appendCustomMarkup});

    // Set up UI handler methods
    doc.on("click", ".button, .action", function(e) {
      var self = this;

      // Abort if disabled
      if (angular.element(this).hasClass("disabled")) {
        return false;
      }

      // For links etc, don't allow the default action
      e.preventDefault();
    });

    // Set up methods to handle URL copying -- replace the contenteditable
    // bits with regular spans to allow proper selection
    angular.element(".url").bind("mousedown", function(e) {
      if (angular.element(e.target).hasClass("paramString") ||
          angular.element(e.target).hasClass("queryString")) {
        return true;
      }
      angular.element(".paramString,.queryString").removeAttr("contenteditable");
      selectText(angular.element(".url")[0]);
      return false;
    });

    angular.element("body").bind("mousedown", function(e) {
      if (!angular.element(e.target).hasClass("url")) {
        angular.element(".paramString,.queryString").attr("contenteditable", true);
      }
    });

    doc.on("reveal:open", ".reveal-modal", function(e) {
      var _this = angular.element(this);
      _this.find('.initial').show();
      _this.find('.success').hide();
      _this.find('.error').hide();
    });

    angular.element(".reveal-modal dd input").mouseup(function() {
      angular.element(this).select();
    });
  });

  /** Directives
   *
   * Most of these directives 'wrap' the DOM manipulations required by
   * rendr.it.
   *
   * If you need to do DOM manipulation, write a directive and put
   * them here.
   */

  /** tooltip
   *
   * <a href="#" tooltip="click me">Click</a>
   */
  RendrItMod.directive('tooltip', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        // Set up tooltips
        element.tipsy({
          delayIn: 750,
          fade: true,
          offset: 10,
          title: function() { return attrs.tooltip;},
          gravity: element.hasClass("northwest") ? "nw" : element.hasClass("northeast") ? "ne" : element.hasClass("east") ? "e" : element.hasClass("west") ? "w" : element.hasClass("south") ? "s" : "n"
        });
      }
    };
  });

  /** modal-dialog
   *
   * Handles opening or closing of some Foundation Reveal dialogs in rendr.it.
   *
   * <div id="new-rendr" class="reveal-modal small" modal-dialog ng-transclude>...</div>
   */
  RendrItMod.directive('modalDialog', function() {
    return {
      restrict: 'A',
      transclude: true,
      link: function(scope, element, attrs) {

        scope.$on("modal.close", function(event, args) {
          if (element.attr("id") !== args) { return;}
          element.triggerHandler('reveal:close');
        });

        scope.$on("modal.open",  function(event, args) {
          if (element.attr("id") !== args) { return;}
          element.reveal();
        });
      }
    };
  });

  /** url-string
   *
   * Directive that handles the query string and param string of a
   * rendr url. Triggers a 'rendrUrlStringChanged' event which
   * notifies listeners to update the (live) preview content.
   *
   * <span class="paramString" url-string="/"...></span>
   *
   * .. or <span class="queryString" url-string="?" ..></span>
   */
  RendrItMod.directive('urlString', function() {
    return {
      restrict: 'A',
      require: "ngModel",
      transclude: true,
      replace: true,
      link: function(scope, element, attrs, ngModel) {
        if (!ngModel) { return;}

        // The model was update, push the value into the view.
        ngModel.$render = function() {
          if (element.text() === ngModel.$viewValue) { return;}
          element.text(ngModel.$viewValue || "");
          updateText(ngModel.$viewValue || "");
        };

        element.bind('textchange', $.debounce(function() {
          var text = element.text();
          updateText(text);
          ngModel.$setViewValue(text);
          scope.$broadcast("rendrUrlStringChanged");
        }, 400));

        function updateText(value) {
          if (value && value.trim()) {
            element.prev().text(stringWithLastChar(element.prev().text(), attrs.urlString));
          } else {
            element.prev().text(stringWithoutLastChar(element.prev().text(), attrs.urlString));
          }
        }
      }
    };
  });

  /** preview-style
   *
   * Directive that updates the style of the preview pane according
   * to the user's chosen theme/color preference.
   *
   * In the following example, the style of the preview element is
   * updated everytime the value of options.gridTheme changes.
   *
   * <div id="preview" preview-style="options.gridTheme">...</div>
   */
  RendrItMod.directive('previewStyle', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        scope.$watch(attrs.previewStyle, function() {
          // Set element to 'transparent'. When set to an empty
          // string, FF sets this to 'transparent' but Chrome sets
          // this to '' which fails the unit test. FF follows the spec
          // in this regard - http://www.w3.org/TR/CSS2/colors.html#background-properties
          element.removeClass().css('background-color', '');
          if (scope.options.gridTheme.match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)) {
            element.css('background-color', scope.options.gridTheme);
            angular.element("#colour-swatch").css('background-color', scope.options.gridTheme);
            angular.element("#colour, #preview-bgcolour").val(scope.options.gridTheme);
            angular.element("#preview-bgcolour").attr("checked",true).closest('li').addClass('active');
          } else {
            element.attr("class", "right_panel " + scope.options.gridTheme);
          }
        });
      }
    };
  });

  /** colour-picker
   *
   * Theme options colour picker
   *
   * <colourpicker name="gridTheme" ng-model="app.theme.grid">..</colourpicker>
   */
  RendrItMod.directive('colourpicker', function() {
    return {
      restrict: 'E',
      require: '^ngModel',
      template: "<input type='radio' name='gridTheme' id='preview-bgcolour'/><label for='preview-bgcolour' id='colour-swatch'>Background color</label><input type='text' id='colour' class='radius'/><div id='colourpicker'></div>",
      link: function(scope, element, attrs, ngModel) {
        var previewBgColour = angular.element("#preview-bgcolour"),
            colour = angular.element("#colour");

        var picker = $.farbtastic("#colourpicker", {
          width: 120,
          // Initial callback to allow farbs to set default values
          callback: function(color) {
            previewBgColour.val(color);
            colour.val(color);
            angular.element('#colour-swatch').css('background-color', color);
          }
        });

        // Set a proper callback that updates the angular model
        picker.linkTo(function(color) {
          previewBgColour.val(color);
          colour.val(color);
          angular.element('#colour-swatch').css('background-color', color);
          ngModel.$setViewValue(color);
        });

        angular.element('#colour').keyup(function(){
          var enteredcolour = angular.element(this).val();
          var isHexColour = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

          picker.setColor(enteredcolour);
          angular.element(this).css('color', isHexColour.test(enteredcolour) ? '#404040' : '#f00');
        });

        // Focus Colourpicker by clicking on either label or field
        angular.element('#colour-swatch, #colour').click(function(){
          previewBgColour.attr('checked', true);
          angular.element(this).closest('li').addClass('active');
          angular.element('#colourpicker').fadeIn();
          picker.setColor(previewBgColour.val());
        });

        // Hide colourpicker
        angular.element("body").click(function(){
          angular.element("#colourpicker").fadeOut().removeClass("active");
        });

        // Prevent colourpicker from closing on related elements
        angular.element("#colourpicker, #colour, #colour-swatch, #preview-bgcolour").click(function(e) {
            e.stopPropagation();
        });

        // Remove colourpicker active class from list element
        angular.element('#options input[name=gridTheme]').change(function() {
          angular.element(this).closest('ul').children('li').removeClass('active');
        });
      }
    };
  });

  /** splitter
   *
   * Wraps the jQuery splitter plugin and broadcasts 'resize' events.
   * The HTML and CSS editors listen to this event and resizes their
   * window accordingly.
   *
   * <splitter orientation="horizontal" limit="20" position="40%">...</splitter>
   */
  RendrItMod.directive('splitter', function() {
    return {
      restrict: 'E',
      template: "<div ng-transclude></div>",
      transclude: true,
      replace: true,
      link: function(scope, element, attrs) {
        element.attr('id', attrs.id);
        element.split({
          orientation: attrs.orientation,
          limit: attrs.limit,
          position: attrs.position,
          onDrag: function() {
            scope.$broadcast("splitter.resize");
          }
        });
        angular.element(attrs.orientation === 'horizontal' ? '.hsplitter' : '.vsplitter')
          .append("<span>...</span>");
      }
    };
  });

  /** preview
   *
   * Handles updates to the content preview, live or otherwise.
   *
   * <preview body="..." css="..." mode="...">...</preview>
   */
  RendrItMod.directive('preview', ['$timeout', function($timeout, Rendr) {
    return {
      restrict: 'E',
      template: "<iframe ng-transclude style='width:0;height:0'></iframe>",
      transclude: true,
      replace: true,
      link: function(scope, element, attrs) {

        scope.$watch(attrs.css, function(newv) {
          updateContents(newv, scope.app.content.body);
        });

        scope.$watch(attrs.body, function(newv) {
          updateContents(scope.app.content.css, newv);
        });

        scope.$watch(attrs.mode, function() {
          updateContents(scope.app.content.css, scope.app.content.body);
        });

        // Update preview content when the url param or query string changes
        scope.$on('rendrUrlStringChanged', function() {
          updateContents(scope.app.content.css, scope.app.content.body);
        });

        function updateContents(css, body) {
          if (scope.app.content.previewMode === 'live') {
            updateLocalContent(css, body);
          } else {
            updateRenderedContent(css, body);
          }
        }

        function updateLocalContent(css, body) {
          $timeout(function() {
            var startTs = new Date(),
                doc = element.contents()[0],
                qs = scope.app.rendr.testParams,
                params = scope.app.rendr.testPath,
                data = parseQuery("?" + qs),
                content;

            data.params = (params || '').split('/');

            content = Mustache.render(
              "<!DOCTYPE html><html><head><style>{{{css}}}</style>" +
                "<script>query = {{{query}}};window.decodeBase64UrlSafe" +
                " = function (s) { s = s.replace(/-/g, '+').replace(" +
                "/_/g, '/'); return decodeURIComponent(escape(atob(s " +
                "))); };</script></head>" +
                "<body style='margin:0;padding:0;overflow:hidden'>" +
                "{{{html}}}</body></html>", {
                  css: Mustache.render(css, data),
                  html: Mustache.render(body, data),
                  query: JSON.stringify(data)
                }
            );

            // Clear the dimensions before assigning a new one
            element.css({width: "", height: ""});
            element.load(function() {
              var c = element.contents()[0],
                  body = angular.element(c),
                  w = body.width(),
                  h = body.height();

              element.css({
                width: w + "px",
                height: h + "px",
                "margin-left": '-' + Math.round(w / 2) + "px",
                "margin-top": '-' + Math.round(h / 2) + "px"
              });


              scope.$apply(function() {
                // Force a digest cycle to make Firefox happy
                scope.app.content.status.width = w;
                scope.app.content.status.height = h;
                scope.app.content.status.filesize = "?";
                scope.app.content.status.rendertime = "" + ((new Date()).valueOf() - startTs.valueOf()) / 1000.0;
              });
          });

            doc.open();
            doc.write(content);
            doc.close();

          }, 1);
        }

        // Update rendered preview
        function updateRenderedContent(css, body) {
          $timeout(function() {
            var startTs = new Date(),
                doc = element.contents()[0],
                qs = scope.app.rendr.testParams,
                params = scope.app.rendr.testPath,
                format = 'png',
                content,
                url;

            url = "/" + scope.app.rendr.libraryId + "/" +
              scope.app.rendr.rendrId + "/" + params + "." +
              format + "?" + qs;

            element.load(function() {
              var body = element.contents().find("html"),
                  w = body.width(),
                  h = body.height();

              element.css({
                width: w + "px",
                height: h + "px",
                "margin-left": '-' + Math.round(w / 2) + "px",
                "margin-top": '-' + Math.round(h / 2) + "px"
              });

              scope.app.content.status.width = w;
              scope.app.content.status.height = h;
              scope.app.content.status.filesize = "?";
              scope.app.content.status.rendertime = "" + ((new Date()).valueOf() - startTs.valueOf()) / 1000.0;
            });

            doc.open();
            doc.write("<html><head></head><body style='margin:0;padding:" +
                      "0;overflow:hidden'><img src='" + url +
                      "' style='display:block' /></body></html>");
            doc.close();
          }, 1);
        }

        $timeout(function() {
          // Enable Foundation Reveal elements that are in the iframe
          element.contents().find("a[data-reveal-id]").click(function(e) {
            var _this = angular.element(this);
            angular.element('#' + _this.attr("data-reveal-id")).reveal(_this.data());
            return false;
          });
        }, 400);

      }
    };
  }]);

  /** editor
   *
   * Provides a wrapper directive to ACE editor. Handles updates to
   * the HTML and CSS editors.
   *
   * <editor ..></editor>
   */
  RendrItMod.directive('editor', function() {
    return {
      restrict: 'E',
      require: "ngModel",
      transclude: true,
      template: "<pre ng-transclude></pre>",
      replace: true,
      link: function(scope, element, attrs, ngModel) {

        // initialise editor
        var editor = ace.edit(attrs.id);
        editor.setTheme("ace/theme/rendr");
        editor.getSession().setUseWorker(false);
        editor.getSession().setMode("ace/mode/" + attrs.mode);
        editor.setReadOnly(true);

        ngModel.$setViewValue(editor.getSession().getValue());
        scope.app.content[attrs.property] = ngModel.$modelValue;

        ngModel.$render = function() {
          // Called when the view needs to be updated
          editor.getSession().setValue(ngModel.$viewValue);
          editor.setReadOnly(false);
        };

        // add resize listener
        scope.$on("splitter.resize", function() {
          editor.resize();
        });

        // add change listeners
        var debounceCodeChange = $.debounce(function() {
          // Check if editor content changed..
          if (editor.getSession().getValue() !== ngModel.$modelValue) {
            scope.$apply(function() {
              // Set the value of the model to the editor's content
              ngModel.$setViewValue(editor.getSession().getValue());
              // Switch to live view if code has changed
              if (scope.app.content.previewMode === 'rendered') {
                scope.app.content.previewMode = 'live';
              }
            });
          }

          scope.app.content.hasChanged = scope.app.rendr[attrs.property] !== ngModel.$modelValue;

        }, 250);

        // Re-render on each editor/query string change, at most 4x per sec
        editor.getSession().on('change', debounceCodeChange);
        element.append('<div class="title">' + attrs.id.toUpperCase() + '</div>');

        // Fade pane title on hover
        angular.element("#" + attrs.id).hoverIntent(function() {
          angular.element(this).find('.title').fadeOut('fast');
        }, function() {
          angular.element(this).find('.title').fadeIn('fast');
        });
      }
    };
  });

  /** Services
   *
   * The following services handle loading and saving of library, rendr, and user options.
   */

  /** Library Service
   *
   * Provides a service for retrieving existing libraries, and storing
   * a new library.
   */
  RendrItMod.factory('Library', ["$http", function($http) {
    var Library = Object.create(null);
    Library.rendrs = [];

    /** Library from data
     *
     * Given a library object, creates a new library
     *
     * Returns the Library.
     */
    Library.fromData = function(data, key) {
      Library = angular.extend(Library, data);
      Library.key = key;
      return Library;
    };

    /** Get library
     *
     * Retrieves a library with a specific id and key.
     *
     * Returns a Future object (HttpPromise)
     */
    Library.get = function(id, key) {
      return $http.get('/library/' + id, {params: {key: key}}).then(function(response) {
        Library = angular.extend(Library, response.data);
        Library.key = key;
        return Library;
      }, function(response) {
        return Library;
      });
    };

    /** Save library
     *
     * Stores the library with the given name.
     *
     * Returns a Future object (HttpPromise)
     */
    Library.save = function(name) {
      return $http.post('/library/', $.param({name: name}), {
        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}
      }).then(function(response) {
        Library = angular.extend(Library, response.data);
        return Library;
      });
    };


    /** Add rendr ID
     *
     * Add the given rendr ID to the rendrs in the library.
     */
    Library.addRendrId = function(rendrId) {
      if (Library.rendrs.indexOf(rendrId) === -1) {
        Library.rendrs.push(rendrId);
      }
    };

    return Library;
  }]);


  /** Rendr Service
   *
   * Provides a service for managing rendrs.
   */
  RendrItMod.factory('Rendr', ["$http", "Library",  function($http, Library) {
    var Rendr = Object.create(null);

    /** Get rendr
     *
     * Retrieves a rendr from a library
     *
     * Returns a Future object
     */
    Rendr.get = function(libraryId, rendrId) {
      return $http.get('/' + libraryId + "/" + rendrId + ".json").then(function(response) {
        Rendr = angular.extend(Rendr, response.data);
        return Rendr;
      });
    };

    /** Save rendr
     *
     * Returns a Future object
     */
    Rendr.save = function(libraryId, libraryKey, rendrId, css, html, testPath, testParams) {
      return $http.put('/rendr/' + libraryId + "/" + rendrId, {
        libraryKey: libraryKey,
        css: css,
        body: html,
        testPath: testPath,
        testParams: testParams
      }).then(function(response) {
        Rendr = angular.extend(Rendr, response.data);
        Library.addRendrId(response.data.rendrId);
        return Rendr;
      });
    };

    return Rendr;
  }]);

  RendrItMod.factory('Options', function() {
    var Options = Object.create(null),
        defaults = {"theme": "theme-dark", "gridTheme": "preview-wood"};

    Options = angular.extend(Options, defaults);

    Options.get = function() {
      Options._sync();
      return Options;
    };

    Options.save = function(options) {
      if (!options) { return;}
      localStorage.setItem('options', JSON.stringify(options));
      Options._sync();
      return Options;
    };

    Options._sync = function() {
      var options = window.localStorage.getItem('options');
      if (!options) {
        options = defaults;
      } else {
        options = JSON.parse(localStorage.getItem('options'));
      }
      Options = angular.extend(Options, options);
      return Options;
    };

    return Options;
  });

  /** Controller
   *
   */
  RendrItMod.controller('AppController', ["$scope", "$timeout", "Options", "Rendr", "Library", function($scope, $timeout, Options, Rendr, Library) {

    $scope.app = {
      content: {
        body: '',
        css: '',
        previewMode: 'live',
        hasChanged: false,
        status: {width: '--', height: '--', filesize: '--', rendertime: '--'}
      },
      theme: {value: "theme-dark", grid: "preview-wood"},
      newRendr: {contentSource: 'current', rendrId: ''},
      rendr: {body: '', css: '', testParams: '', testPath: ''},
      testPath: "",
      testParams: ""
    };

    if (window.rendrLibrary) {
      window.setTimeout(function() {
        $scope.library =
          Library.fromData(window.rendrLibrary, window.rendrKey);
      }, 50);
    }

    // Load / Initialize options
    // scope.options is the user's saved theme;
    // app.theme is the options view's model
    $scope.options = Options.get();
    $scope.app.theme.value = $scope.options.theme;
    $scope.app.theme.grid = $scope.options.gridTheme;

    $scope.libraryName = function() {
      if (!$scope.library || !$scope.library.key) { return "(No library loaded)";}

      return $scope.library.name;
    };

    $scope.saveOptions = function() {
      // This is unnecessary if we apply the theme instantly
      $scope.options.theme = $scope.app.theme.value;
      $scope.options.gridTheme = $scope.app.theme.grid;
      Options.save($scope.options);
      $scope.$broadcast("modal.close", "options");
    };

    $scope.showNewRendr = function() {
      if (!$scope.library) { return;}
      $scope.$broadcast("modal.open", "new-rendr");
    };

    $scope.loadRendr = function(rendrId) {
      $scope.inprogress = true;

      Rendr.get($scope.library.libraryId, rendrId)
        .then(function(rendr) {
          $scope.inprogress = false;
          $scope.app.rendr = rendr;

          // This is a hack. If the loaded rendr content is the same
          // as the default content, the editor stays read-only. The
          // extra space forces ngModel to recognize a 'change' in the
          // content, which sets the editor's read-only property to
          // false, hence, writable.
          $scope.app.content.body = rendr.body.trim() + " ";
          $scope.app.content.css = rendr.css.trim() + " ";

          $scope.app.content.hasChanged = false;
        }, function() {
          $scope.inprogress = false;
          $scope.$broadcast("modal.open", "load-rendr-error");
        });
    };

    $scope.newRendr = function() {
      var html, css;

      $scope.inprogress = true;
      if ($scope.app.newRendr.contentSource === 'current') {
        css = $scope.app.content.css;
        html = $scope.app.content.body;
      } else {
        css = "/* Rendr " + $scope.app.newRendr.rendrId + ": CSS content */";
        html = "<!-- Rendr " + $scope.app.newRendr.rendrId + ": HTML body content -->";
      }

      Rendr.save($scope.library.libraryId, $scope.library.key, $scope.app.newRendr.rendrId, css, html,
                 $scope.app.rendr.testPath, $scope.app.rendr.testParams)
        .then(function(rendr) {
          $scope.inprogress = false;
          $scope.app.rendr = rendr;

          // See explanation in loadRendr() above.
          $scope.app.content.css = rendr.css.trim() + " ";
          $scope.app.content.body = rendr.body.trim() + " ";
          $scope.$broadcast("modal.close", "new-rendr");
        }, function() {
          $scope.inprogress = false;
        });
    };

    $scope.saveRendr = function() {
      if (!$scope.editorHasUnsavedChanges()) { return;}
      $scope.inprogress = true;

      Rendr.save($scope.library.libraryId, $scope.library.key, $scope.app.rendr.rendrId,
                 $scope.app.content.css, $scope.app.content.body,
                 $scope.app.rendr.testPath, $scope.app.rendr.testParams)
        .then(function(rendr) {
          $scope.inprogress = false;
          $scope.app.rendr = rendr;
          $scope.app.content.css = rendr.css;
          $scope.app.content.body = rendr.body;
          $scope.app.content.hasChanged = false;
        }, function() {
          $scope.$broadcast("modal.open", "save-rendr-error");
          $scope.inprogress = false;
        });
    };

    $scope.previewLive = function() {
      if ($scope.app.content.previewMode == "rendered") {
        $scope.app.content.previewMode = "live";
      }
    };

    $scope.previewRendered = function() {
      // We can't preview a non-existent rendr
      if (!$scope.app.rendr.rendrId) { return;}

      if ($scope.app.content.previewMode === "live") {
        $scope.app.content.previewMode = "rendered";
      }
    };

    $scope.editorHasUnsavedChanges = function() {
      return $scope.app.content.hasChanged;
    };

    $scope.loadLibrary = function() {
      $scope.inprogress = true;
      Library.get($scope.library.id, $scope.libraryKey)
        .then(function(library) {
          $scope.inprogress = false;
          $scope.library = library;
        });
    };

    $scope.newLibrary = function() {
      $scope.inprogress = true;
      Library.save($scope.library.name)
        .then(function(library) {
          $scope.inprogress = false;
          $scope.library = library;
        });
    };

  }]);

})(jQuery);
