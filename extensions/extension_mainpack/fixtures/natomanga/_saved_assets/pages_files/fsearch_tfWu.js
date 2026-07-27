(function ($) {
    function change_alias(alias){var str=alias;str=str.toLowerCase();str=str.replace(/Ã |Ã¡|áº¡|áº£|Ã£|Ã¢|áº§|áº¥|áº­|áº©|áº«|Äƒ|áº±|áº¯|áº·|áº³|áºµ/g,"a");str=str.replace(/Ã¨|Ã©|áº¹|áº»|áº½|Ãª|á»|áº¿|á»‡|á»ƒ|á»…/g,"e");str=str.replace(/Ã¬|Ã­|á»‹|á»‰|Ä©/g,"i");str=str.replace(/Ã²|Ã³|á»|á»|Ãµ|Ã´|á»“|á»‘|á»™|á»•|á»—|Æ¡|á»|á»›|á»£|á»Ÿ|á»¡/g,"o");str=str.replace(/Ã¹|Ãº|á»¥|á»§|Å©|Æ°|á»«|á»©|á»±|á»­|á»¯/g,"u");str=str.replace(/á»³|Ã½|á»µ|á»·|á»¹/g,"y");str=str.replace(/Ä‘/g,"d");str=str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'| |\"|\&|\#|\[|\]|~|-|$|_/g,"_");str=str.replace(/_+_/g,"_");str=str.replace(/^\_+|\_+$/g,"");return str;}

    $.fn.fsearch = function () {
        var $searchInput = $(this); $searchInput.after('<div id="search_result"></div>'); $resultDiv = $('#search_result'); $searchInput.addClass('searchi'); $resultDiv.html("<ul></ul><div id='search-footer' class='searchf'></div>"); $old = ''; var timesearchstory = null; $searchInput.keyup(function (e) {
            var q = $(this).val().trim(); if (q != '') {
                if (q == $old || q.length < 3)
                    return; if (q == $old && e.keyCode != 13) {
                        if (e.keyCode == 27) { $searchInput.val(''); $resultDiv.hide(); }
                        return;
                    }
                $old = q; var current_index = $('.selected').index(), $options = $resultDiv.find('.option'), items_total = $options.length; $resultDiv.fadeIn(); $resultDiv.find('#search-footer').html("<img src='" + baseurljs + "/images/loadersearch.gif' alt='Collecting Data...'/>"); if (timesearchstory != null) { clearTimeout(timesearchstory); }
                timesearchstory = setTimeout(function () {
                    timesearchstory = null; $.ajax({
                        contentType: "application/x-www-form-urlencoded; charset=UTF-8", url: baseurljs + '/home/search/json', type: 'GET', data: "searchword=" + change_alias(q), dataType: "json", success: function (jsonResult) {
                            var str = ''; for (var i = 0; i < jsonResult.length; i++) { str += '<a href="' + jsonResult[i].url + '"><li onmouseover="fmouseover(' + jsonResult[i].id + ');" id=' + jsonResult[i].id + ' class="option"><img class="search_result_img" src="' + jsonResult[i].thumb + '" /><div class="search_result_item_right"><p class="search_result_row1" id="' + jsonResult[i].slug + '" >' + jsonResult[i].name + '</p><p class="search_result_row2">' + jsonResult[i].author + '</p><p class="search_result_row3">' + jsonResult[i].chapterLatest + '</p></div></li></a>'; }
                            $resultDiv.find('ul').empty().prepend(str); $url_search_tam = _base_url_search + change_alias(q); $search_panel = "<p><a href='" + $url_search_tam + "' style='color: #ff530d;' >Click here to view all results.</a></p>"; if (jsonResult.length > 0)
                                $resultDiv.find('div#search-footer').html("<p>Display first " + jsonResult.length + " results.</p>" + $search_panel); else
                                $resultDiv.find('div#search-footer').html("<p>No matches found. Try a different search...</p>" + $search_panel);
                        }
                    });
                }, 1000);
            }
            else { $resultDiv.hide(); }
        }); jQuery(document).on("click", function (e) {
            var $clicked = $(e.target); if ($clicked.hasClass("searchi") || $clicked.hasClass("searchf")) { }
            else { $resultDiv.fadeOut(); }
        }); $searchInput.click(function () {
            var q = $(this).val(); if (q != '') { $resultDiv.fadeIn(); }
        });
    };
})(jQuery); function fmouseover(id) { $(".option").removeClass("selected"); document.getElementById(id).className += " selected"; }
