/*!
 * jQuery TextChange Plugin
 * http://www.zurb.com/playground/jquery-text-change-custom-event
 *
 * Copyright 2010, ZURB
 * Released under the MIT License
 */
(function ($) {
    function val(element) {
        return element[0].tagName === 'INPUT' || element[0].tagName === 'TEXTAREA' ? element.val() : element.text();
    }

    $.event.special.textchange = {

        setup: function (data, namespaces) {
          $(this).data('lastValue', this.contentEditable === 'true' ? $(this).html() : $(this).val());
            $(this).bind('keyup.textchange', $.event.special.textchange.handler);
            $(this).bind('cut.textchange paste.textchange input.textchange', $.event.special.textchange.delayedHandler);
        },

        teardown: function (namespaces) {
            $(this).unbind('.textchange');
        },

        handler: function (event) {
            $.event.special.textchange.triggerIfChanged($(this));
        },

        delayedHandler: function (event) {
            var element = $(this);
            setTimeout(function () {
                $.event.special.textchange.triggerIfChanged(element);
            }, 25);
        },

        triggerIfChanged: function (element) {
            var current = val(element);
            if (current !== element.data('lastValue')) {
                element.trigger('textchange',  [element.data('lastValue')]);
                element.data('lastValue', current);
            }
        }
    };

    $.event.special.hastext = {

        setup: function (data, namespaces) {
            $(this).bind('textchange', $.event.special.hastext.handler);
        },

        teardown: function (namespaces) {
            $(this).unbind('textchange', $.event.special.hastext.handler);
        },

        handler: function (event, lastValue) {
            if ((lastValue === '') && lastValue !== val($(this))) {
                $(this).trigger('hastext');
            }
        }
    };

    $.event.special.notext = {

        setup: function (data, namespaces) {
            $(this).bind('textchange', $.event.special.notext.handler);
        },

        teardown: function (namespaces) {
            $(this).unbind('textchange', $.event.special.notext.handler);
        },

        handler: function (event, lastValue) {
            if (val($(this)) === '' && val($(this)) !== lastValue) {
                $(this).trigger('notext');
            }
        }
    };

})(jQuery);
