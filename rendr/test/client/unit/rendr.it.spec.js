describe("Rendr.it", function() {
  // Initialize RendrIt module before each  test
  beforeEach(module('RendrIt'));

  // Directives unit tests
  describe("Directive", function() {
    var $compile,
        $timeout,
        $rootScope;

    beforeEach(inject(function(_$compile_, _$rootScope_, _$timeout_) {
      $compile = _$compile_;
      $timeout = _$timeout_;
      $rootScope = _$rootScope_;
    }));

    describe("urlString", function() {
      var elm;

      beforeEach(function() {
        elm = angular.element(
          "<span>.png</span><span class='queryString' ng-model='testmodel' url-string='?'></span>"
        );
        $compile(elm)($rootScope);
        $rootScope.$digest();
      });
      
      it("should update string after model changes", function() {
        expect(elm.text()).toBe('.png');
        $rootScope.testmodel = "width=300";
        $rootScope.$digest();
        expect(elm.text()).toBe('.png?width=300');
      });
    });

    describe("previewStyle", function() {
      var elm;

      beforeEach(function() {
        elm = angular.element(
          "<div id='preview' class='preview' preview-style='options.gridTheme'>...</div>" +
            "<div id='colour'></div>" +
            "<div id='preview-bgcolour'></div>" +
            "<div id='colour-swatch'></div>"
        );
        $rootScope.options = {theme: '', gridTheme: ''};
        elm = $compile(elm)($rootScope);
        $rootScope.$digest();
      });

      it("should be able to change preview pane's class", function() {
        expect(elm.eq(0).attr("class")).toBe("right_panel ");
        $rootScope.options.gridTheme = "preview-wood";
        $rootScope.$digest();
        expect(elm.eq(0).attr("class")).toBe("right_panel preview-wood");
      });

      it("should be able to change preview pane's background-color if theme is user defined", function() {
        $rootScope.options.gridTheme = "#808090";
        $rootScope.$digest();
        expect(elm.eq(0).css("background-color")).toBe("rgb(128, 128, 144)");
      });
    });
  });


  // Library service unit tests
  describe("Library Service", function() {
    var service, $httpBackend, $rootScope;

    beforeEach(inject(function(Library, _$httpBackend_, _$rootScope_) {
      service = Library;
      $httpBackend = _$httpBackend_;
      $rootScope = _$rootScope_;
    }));

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });

    it("should return the library with the specific ID and Key", function() {
      $httpBackend.expect("GET", "/library/abcdefghij?key=klmnopqrstuvwxyz")
        .respond({
          libraryId: 'abcdefghij',
          key: 'klmnopqrstuvwxyz',
          name: 'Demo Test1',
          rendrs: ['rendr1', 'rendr2']
        });

      var promise = service.get("abcdefghij", "klmnopqrstuvwxyz");
      $rootScope.$digest();
      $httpBackend.flush();
      promise.then(function(response) {
        expect(response.libraryId).toBe("abcdefghij");
        expect(response.key).toBe('klmnopqrstuvwxyz');
        expect(response.name).toBe('Demo Test1');
        expect(response.rendrs.length).toBe(2);
      });
    });

    it("should be able to save a new library", function() {
      $httpBackend.expect("POST", "/library/", "name=New+Library", function(headers) {
        return headers['Content-Type'] === 'application/x-www-form-urlencoded; charset=UTF-8';
      }).respond({
        keyHash: "klmnop1233",
        libraryId: 'abcdefh',
        key: 'wxyz',
        name: 'New Library'
      });

      var promise = service.save("New Library");
      $rootScope.$digest();
      $httpBackend.flush();
      promise.then(function(response) {
        expect(response.libraryId).toBe("abcdefh");
        expect(response.name).toBe("New Library");
        expect(response.key).toBe("wxyz");
        expect(response.keyHash).toBe("klmnop1233");
      });
    });

    it("should be able to add a rendr ID to its rendrs", function() {
      service.addRendrId("id2");
      expect(service.rendrs.length).toBe(1);
      service.addRendrId("id3");
      expect(service.rendrs.length).toBe(2);
      service.addRendrId("id2");
      expect(service.rendrs.length).toBe(2);
    });

  });

  // Rendr service unit tests
  describe("Rendr Service", function() {
    var service, $httpBackend, $rootScope, rendrs = [];

    beforeEach(inject(function(Rendr, Library, _$httpBackend_, _$rootScope_) {
      service = Rendr;
      $httpBackend = _$httpBackend_;
      $rootScope = _$rootScope_;

      spyOn(Library, "addRendrId").andCallFake(function(id) {
        rendrs.push(id);
      });
    }));

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();

      rendrs.splice(0);
    });

    it("should return an existing rendr with the given rendr ID", function() {
      $httpBackend.expect("GET", "/libid1/rendrid1.json")
        .respond({
          body: "<!-- Rendr Default Example: HTML body content -->",
          css: "/* Rendr Default Example: CSS content */",
          libraryId: "libid1",
          rendrId: "rendrid1",
          testParams: "name=foo&width=200",
          testPath: "/a/b/c"
        });

      var promise = service.get("libid1", "rendrid1");
      $rootScope.$digest();
      $httpBackend.flush();
      promise.then(function(response) {
        expect(response.libraryId).toBe("libid1");
        expect(response.rendrId).toBe("rendrId1");
        expect(response.testParams).toBe("name=foo&width=200");
        expect(response.testPath).toBe("/a/b/c");
        expect(response.body).toBe("<!-- Rendr Default Example: HTML body content -->");
        expect(response.css).toBe("/* Rendr Default Example: CSS content */");
      });
    });

    it("should be able to save rendrs", function() {
      $httpBackend.expect("PUT", "/rendr/libid2/rendrid2")
        .respond({
          body: "<div><p>my name is {{name}}</p></div>",
          css: "p { font-size: large; }",
          libraryId: "libdid2",
          rendrId: "rendrid2",
          testParams: "name=bar",
          testPath: ""
        });

      var promise = service.save("libid2", "mspzehr", "rendrid2", "p { font-size: large; }", "<div><p>my name is {{name}}</p></div>", "", "name=bar");
      $rootScope.$digest();
      $httpBackend.flush();
      promise.then(function(response) {
        expect(response.body).toBe("<div><p>my name is {{name}}</p></div>");
        expect(response.css).toBe("p { font-size: large; }");
        expect(response.libraryId).toBe("libid2");
        expect(response.rendrId).toBe("rendrId2");
        expect(response.testParams).toBe("name=bar");
        expect(response.testPath).toBe("");
        expect(rendrs[0]).toBe("rendrid2");
        expect(Library.addRendrId).toHaveBeenCalled();
      });
    });

  });

  // Options Service unit tests
  describe("Options Service", function() {
    var service, origLocalStorage;
    beforeEach(inject(function(Options) {
      service = Options;
      origLocalStorage = window.localStorage;

      // Mock window.localStorage
      var store = Object.create(null);
      store.getItem = function(key) {
        return store[key];
      };
      store.setItem = function(key, value) {
        store[key] = value + '';
      };
      store.clear = function() {
        store = Object.create(null);
      };

      Object.defineProperty(window, "localStorage", {value: store, writeable: true, configurable: true, enumerable: true});
      spyOn(window.localStorage, 'getItem').andCallThrough();
      spyOn(window.localStorage, 'setItem').andCallThrough();
    }));

    afterEach(inject(function(Options) {
      Options.save({"theme": "theme-dark", "gridTheme": "preview-wood"});
      Object.defineProperty(window, "localStorage", {value: origLocalStorage, writeable: true, configurable: true, enumerable: true});
    }));

    it("should return default options when nothing is saved", function() {
      var options = service.get();
      expect(options.theme).toBe("theme-dark");
      expect(options.gridTheme).toBe("preview-wood");
      expect(window.localStorage.getItem).toHaveBeenCalled();
    });

    it("should be able to save options", function() {
      var options = service.save({"theme": "theme-light", "gridTheme": "#808080"});
      expect(options.theme).toBe("theme-light");
      expect(options.gridTheme).toBe("#808080");
      expect(window.localStorage.setItem).toHaveBeenCalled();
    });
  });

  // Controller unit tests
  describe("AppController", function() {
    var $httpBackend, scope, OptionsSrv, LibrarySrv, RendrSrv;
    beforeEach(inject(function($rootScope, _$httpBackend_, $controller, Library, Rendr, Options) {
      $httpBackend = _$httpBackend_;
      scope = $rootScope.$new();
      OptionsSrv = Options;
      LibrarySrv = Library;
      RendrSrv = Rendr;
      $controller("AppController", {
        $scope: scope
      });

    }));

    it("should have default theme values", function() {
      expect(scope.app.theme.value).toBe("theme-dark");
      expect(scope.app.theme.grid).toBe("preview-wood");
    });

    it("should default to live preview", function() {
      expect(scope.app.content.previewMode).toBe('live');
    });

    it("should default new rendrs to current content", function() {
      expect(scope.app.newRendr.contentSource).toBe('current');
    });

    it("should default to no library if there's no library loaded", function() {
      var name = scope.libraryName();
      expect(name).toBe("(No library loaded)");
    });

    it("should be able to save user options", function() {
      var options = {};
      spyOn(OptionsSrv, "save").andCallFake(function(opts) {
        options = opts;
      });
      scope.app.theme.value = "theme-light";
      scope.app.theme.grid = "preview-checkerboard";
      scope.$on("modal.close", function(event, args) {
        expect(args).toBe("options");
      });
      scope.saveOptions();
      scope.$root.$digest();
      expect(scope.options.theme).toBe("theme-light");
      expect(scope.options.gridTheme).toBe("preview-checkerboard");
      expect(OptionsSrv.save).toHaveBeenCalled();
    });

    it("should broadcast to open a new rendr window", function() {
      var cbcalled = false;
      scope.$on("modal.open", function(event, args) {
        cbcalled = true;
        expect(args).toBe("new-rendr");
      });
      scope.showNewRendr();
      scope.$root.$digest();
      expect(cbcalled).toBe(false);
      scope.library = 1;
      scope.showNewRendr();
      scope.$root.$digest();
      expect(cbcalled).toBe(true);
    });

    it("should be able to load a rendr", function() {
      $httpBackend.expect("GET", "/libid1/rendrid1.json")
        .respond({
          body: "<!-- Rendr Default Example: HTML body content -->",
          css: "/* Rendr Default Example: CSS content */",
          libraryId: "libid1",
          rendrId: "rendrid1",
          testParams: "name=foo&width=200",
          testPath: "/a/b/c"   
        });

      spyOn(RendrSrv, "get").andCallThrough();
      scope.library = {libraryId: "libid1"};

      scope.loadRendr("rendrid1");
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(scope.app.rendr.rendrId).toBe("rendrid1");
      expect(scope.app.rendr.libraryId).toBe("libid1");
      expect(scope.app.rendr.testParams).toBe("name=foo&width=200");
      expect(scope.app.content.body).toBe("<!-- Rendr Default Example: HTML body content --> ");
      expect(scope.app.content.css).toBe("/* Rendr Default Example: CSS content */ ");
      expect(scope.app.content.hasChanged).toBeFalsy();
      expect(RendrSrv.get).toHaveBeenCalled();
    });

    it("should send a load rendr error event if loading a rendr failed", function() {
      $httpBackend.expect("GET", "/libid1/rendrid1.json").respond(500, {});
      spyOn(RendrSrv, "get").andCallThrough();
      scope.library = {libraryId: "libid1"};
      scope.$on("modal.open", function(event, args) {
        expect(args).toBe("load-rendr-error");
      });

      scope.loadRendr("rendrid1");
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(RendrSrv.get).toHaveBeenCalled();
    });

    it("should be able to create new rendrs", function() {
      $httpBackend.expect("PUT", "/rendr/libid2/rendrid2")
        .respond({
          body: "<div><p>my name is {{name}}</p></div>",
          css: "p { font-size: large; }",
          libraryId: "libdid2",
          rendrId: "rendrid2",
          testParams: "name=bar",
          testPath: ""
        });

      spyOn(RendrSrv, "save").andCallThrough();
      scope.library = {libraryId: "libid2", key: "dffdfd"};
      scope.app.newRendr.rendrId = "rendrid2";
      scope.$on("modal-close", function(_, args) {
        expect(args).toBe("new-rendr");
      });

      scope.newRendr();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(scope.app.content.body).toBe("<div><p>my name is {{name}}</p></div> ");
      expect(scope.app.content.css).toBe("p { font-size: large; } ");
      expect(scope.app.rendr.testParams).toBe("name=bar");
      expect(RendrSrv.save).toHaveBeenCalled();
    });

    it("should be able to create a new rendr with empty content", function() {
      $httpBackend.expect("PUT", "/rendr/libid2/rendrid2")
        .respond({
          body: "<!-- Rendr rendrid2: HTML body content -->",
          css: "/* Rendr rendrid2: CSS content */",
          libraryId: "libdid2",
          rendrId: "rendrid2",
          testParams: "name=baz",
          testPath: ""
        });

      spyOn(RendrSrv, "save").andCallThrough();
      scope.library = {libraryId: "libid2", key: "dffdfd"};
      scope.app.newRendr.rendrId = "rendrid2";
      scope.app.newRendr.contentSource = "empty";
      scope.$on("modal-close", function(_, args) {
        expect(args).toBe("new-rendr");
      });

      scope.newRendr();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(scope.app.content.body).toBe("<!-- Rendr rendrid2: HTML body content --> ");
      expect(scope.app.content.css).toBe("/* Rendr rendrid2: CSS content */ ");
      expect(scope.app.rendr.testParams).toBe("name=baz");
      expect(RendrSrv.save).toHaveBeenCalled();
    });
    
    it("should set progress to false if creating a new rendr failed", function() {
      $httpBackend.expect("PUT", "/rendr/libid2/rendrid2").respond(500, {});
      spyOn(RendrSrv, "save").andCallThrough();
      scope.library = {libraryId: "libid2", key: "dffdfd"};
      scope.app.newRendr.rendrId = "rendrid2";

      scope.newRendr();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(RendrSrv.save).toHaveBeenCalled();
    });

    it("should be able to save changes to a rendr", function() {
      $httpBackend.expect("PUT", "/rendr/lib10/demo-rendr-22")
        .respond({
          body: "<div><p>name is {{name}}</p>.</div>",
          css: "p { font-size: large; }",
          libraryId: "lib10",
          rendrId: "demo-rendr-22",
          testParams: "name=baz",
          testPath: ""
        });

      spyOn(scope, "editorHasUnsavedChanges").andReturn(true);
      spyOn(RendrSrv, "save").andCallThrough();
      scope.library = {libraryId: "lib10", key: "sdfsfsdf"};
      scope.app.rendr.rendrId = "demo-rendr-22";

      scope.saveRendr();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(scope.app.rendr.rendrId).toBe("demo-rendr-22");
      expect(scope.app.content.hasChanged).toBeFalsy();
      expect(scope.app.content.body).toBe("<div><p>name is {{name}}</p>.</div>");
      expect(scope.editorHasUnsavedChanges).toHaveBeenCalled();
      expect(RendrSrv.save).toHaveBeenCalled();
    });

    it("should ignore saving when there are no changes to the content", function() {
      spyOn(scope, "editorHasUnsavedChanges").andReturn(false);
      spyOn(RendrSrv, "save").andCallFake(function() {});
      scope.saveRendr();
      scope.$root.$digest();
      expect(scope.inprogress).toBeFalsy();
      expect(scope.editorHasUnsavedChanges).toHaveBeenCalled();
      expect(RendrSrv.save).not.toHaveBeenCalled();
    });

    it("should be able to preview live content", function() {
      scope.app.content.previewMode = 'rendered';
      scope.previewLive();
      expect(scope.app.content.previewMode).toBe("live");
    });

    it("should be able to preview rendered content", function() {
      scope.app.rendr.rendrId = 'abcd';
      scope.app.content.previewMode = 'live';
      scope.previewRendered();
      expect(scope.app.content.previewMode).toBe("rendered");
    });

    it("should ignore previewing rendered content when there's no rendr (id)", function() {
      scope.app.content.previewMode = 'live';
      scope.previewRendered();
      expect(scope.app.content.previewMode).toBe("live");
    });

    it("should be able to load a library", function() {
      $httpBackend.expect("GET", "/library/abcdefghij?key=klmnopqrstuvwxyz")
        .respond({
          libraryId: 'abcdefghij',
          key: 'klmnopqrstuvwxyz',
          name: 'Demo Test1',
          rendrs: ['rendr1', 'rendr2']
        });

      spyOn(LibrarySrv, "get").andCallThrough();
      scope.library = {id: "abcdefghij"};
      scope.libraryKey = "klmnopqrstuvwxyz";

      scope.loadLibrary();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(LibrarySrv.get).toHaveBeenCalled();
      expect(scope.library.libraryId).toBe("abcdefghij");
      expect(scope.library.key).toBe("klmnopqrstuvwxyz");
      expect(scope.library.name).toBe("Demo Test1");
      expect(scope.library.rendrs.length).toBe(2);
    });

    it("should be able to save a new library", function() {
      $httpBackend.expect("POST", "/library/", "name=Test+Library+1", function(headers) {
        return headers['Content-Type'] === 'application/x-www-form-urlencoded; charset=UTF-8';
      }).respond({
        keyHash: "klmnop1233",
        libraryId: 'abcdefh',
        key: 'wxyz',
        name: 'Test Library 1'
      });

      spyOn(LibrarySrv, "save").andCallThrough();
      scope.library = {name: "Test Library 1"};

      scope.newLibrary();
      expect(scope.inprogress).toBeTruthy();
      scope.$root.$digest();
      $httpBackend.flush();
      expect(scope.inprogress).toBeFalsy();
      expect(LibrarySrv.save).toHaveBeenCalled();
      expect(scope.library.keyHash).toBe("klmnop1233");
      expect(scope.library.libraryId).toBe("abcdefh");
      expect(scope.library.key).toBe("wxyz");
      expect(scope.library.name).toBe("Test Library 1");
    });
  });
});
