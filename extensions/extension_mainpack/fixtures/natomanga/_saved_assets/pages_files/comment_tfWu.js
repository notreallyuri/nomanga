/*!
  QQ Comment Service v2.0.4
 */

let lastSubmitTime = null;
let isFirstScrollToComment = false;

function openReplyBox(event, type) {
  event.stopPropagation();

  const $commentItem = $(event.target).closest(".comment-item");

  if ($commentItem.length === 0) return;

  // Remove all existing reply boxes
  $(".reply-box").remove();

  // Clone the editor template
  const $template = $("#editor-root").clone().removeClass("post").addClass("reply");
  attachEditorEvents($template.get(0));

  const $editor = $template.find("#editor");

  const $buttons = $template.find('button.btn-format');

  $buttons.each(function () {
    const $btn = $(this);
    $btn.removeClass("active");

    const onclick = $btn.attr('onclick');

    if (onclick) {
      const newOnclick = onclick.replace(/(format\([^,]+,\s*[^,]+,\s*)'[^']*'/, `$1'reply'`);
      $btn.attr('onclick', newOnclick);
    }
  });

  let parentId = $commentItem.data("comment-id");

  const $repliesContainer = $commentItem.closest(".comment-replies");
  if ($repliesContainer.length > 0) {
    parentId = $repliesContainer.data("comment-parent-id");
  }

  $template.attr("data-parent-id", parentId);

  const toolbar = $template.find("#toolbar-actions");
  const cancelBtn = $("<button class='cancel-btn'>Cancel</button>")
  const submitBtn = toolbar.find("#submit-comment");

  cancelBtn.on("click", function () {
    $template.remove();
  });

  cancelBtn.insertBefore(submitBtn)

  // Handle type: reply or edit
  if (type === "reply") {
    $editor.html("");
    $template.attr("data-type", "reply");
  }

  if (type === "edit") {
    const originalHTML = $commentItem.find(".comment-des").data('original-html') || $commentItem.find(".comment-des").html();
    $editor.html(originalHTML);
    $(".dropdown-content").removeClass("show");
    $template.attr("data-type", "edit");
  }

  const $wrapper = $("<div class='reply-box'></div>").append($template);

  initEmojiPicker($wrapper.get(0));
  initStickerPicker($wrapper.get(0))
  initOnValueChange($editor);

  const $replies = $commentItem.find(".comment-replies").first();
  if ($replies.length > 0) {
    $wrapper.insertBefore($replies);
  } else {
    $commentItem.append($wrapper);
  }

  $template.find("#submit-comment")
    .removeAttr("onclick")
    .off("click")
    .on("click", async function (e) {
      e.preventDefault();

      const $btn = $(this);
      $btn.prop("disabled", true); // Disable button

      // You can access the comment content here
      const content = $template.find(".editor.post").html();
      const pureText = $template.find(".editor.post").text();

      // You can access the type and parent_id if needed
      const type = $template.data("type");
      const parentId = $template.data("parent-id");

      const $editor = $('#editor');
      const minLength = parseInt($editor.data('minlength'));
      const errorMessage = $editor.data('minlength_message');

      if (!(hasSticker(content)) && !validateContentLength(minLength, pureText)) {
        ToastUI.error(errorMessage);
        $btn.prop('disabled', false); // Re-enable if wrapper not found
        return;
      }

      try {
        if (!checkRemainingTimeForSubmit()) {
          return;
        }

        // Now call your function or AJAX
        if (type === 'edit') {
          const result = await updateComment(parentId, content);
          if (result.status === 'ok') {
            $template.remove();
            $commentItem.find('.comment-des').html(content);
            $commentItem.find('.comment-des').data('originalHtml', content);
            const commentEl = $commentItem.find('.comment-des')[0];
            if (commentEl) {
              truncateHTML(commentEl, 170, 5);
            }

            // Refactor when localize
            $commentItem.find('.time').text('1 second ago');
          }
        } else if (type === 'reply') {
          const result = await replyComment(parentId, content)
          if (result.status === 'ok') {
            $template.remove();

            let $replies = $commentItem.next('.comment-replies');
            if ($replies.length === 0) {
              $replies = $commentItem.closest('.comment-replies');
            }

            if ($replies.length === 0) {
                $replies = $(`<div class="comment-replies" data-comment-parent-id="${parentId}"></div>`);
                $commentItem.after($replies);
            }

            renderChildComment(result.data.comment, $replies);

            // Update comment count if provided
            if (result.data.count) {
              $('.comment-count').text(result.data.count);
            }

            applyCommentPermissions();
          }
        }

        setRemainingTime();
      } catch (e) {

      } finally {
        $btn.prop("disabled", false); // Re-enable button
      }
  });
}

async function replyComment(id, content) {
  const validatedContent = extractContent(content);
  return $.ajax({
    url: `/api/comments/${id}/reply`,
    method: 'POST',
    data: {
      content: validatedContent,
      _token: $('meta[name="csrf-token"]').attr('content') // for Laravel CSRF
    },
    success: function(response) {
      if (response.status === 'ok' && response.data.comment) {
        return response;
      }
    },
    error: function(xhr) {
      console.error('Failed to send comment:', xhr.responseJSON || xhr.statusText);
    }
  });
}

function checkRemainingTimeForSubmit() {
  const now = Date.now();
  const delayMs = 30000;

  if (lastSubmitTime && now - lastSubmitTime < delayMs) {
    const remaining = Math.ceil((delayMs - (now - lastSubmitTime)) / 1000);
    ToastUI.error(`Please wait ${remaining} second${remaining > 1 ? 's' : ''} before commenting.`);
    return false;
  }
  return true;
}

function setRemainingTime() {
  const now = Date.now();

  lastSubmitTime = now;
}

async function updateComment(id, content) {
  const validatedContent = extractContent(content);
  return $.ajax({
    url: `/api/comments/${id}/edit`,
    method: 'PUT',
    data: {
      content: validatedContent,
      _token: $('meta[name="csrf-token"]').attr('content') // for Laravel CSRF
    },
    success: function(response) {
      if (response.status === 'ok') {
        return response;
      }
    },
    error: function(xhr) {
      console.error('Failed to send comment:', xhr.responseJSON || xhr.statusText);
    }
  });
}


function openReportModal(event, commentId) {
  event.stopPropagation();
  document.getElementById("reportModal").classList.remove("hidden");
  $('#report-comment-id').val(commentId);
}

function toggleCommentActionsDropdown(event) {
  event.stopPropagation();

  document.querySelectorAll(".dropdown-content").forEach((el) => {
    el.classList.remove("show");
  });

  const commentItem = event.target.closest(".summary-item");
  const dropdown = commentItem.querySelector(".dropdown-content");
  dropdown.classList.toggle("show");
}

function truncateHTML(element, maxLength = 100, maxBreaks = 5) {
  const originalHTML = element.innerHTML;
  element.dataset.originalHtml = originalHTML;

  const originalClone = element.cloneNode(true);

  let currentLength = 0;
  let currentBreaks = 0;
  let reachedLimit = false;

  function truncateNode(node) {
    if (reachedLimit) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const remaining = maxLength - currentLength;
      const text = node.textContent.slice(0, remaining);
      currentLength += text.length;

      if (text.length < node.textContent.length) {
        reachedLimit = true;
      }

      return document.createTextNode(text);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === "BR") {
        currentBreaks++;
        if (currentBreaks > maxBreaks) {
          reachedLimit = true;
          return null;
        }
        return node.cloneNode();
      }

      const clone = node.cloneNode(false);
      for (const child of node.childNodes) {
        const truncatedChild = truncateNode(child);
        if (truncatedChild) clone.appendChild(truncatedChild);
        if (reachedLimit) break;
      }
      return clone;
    }

    return null;
  }

  function createTruncatedContent() {
    currentLength = 0;
    currentBreaks = 0;
    reachedLimit = false;

    const fragment = document.createDocumentFragment();
    for (const child of originalClone.childNodes) {
      const truncatedChild = truncateNode(child);
      if (truncatedChild) fragment.appendChild(truncatedChild);
      if (reachedLimit) break;
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    if (reachedLimit) {
      wrapper.insertAdjacentText("beforeend", "... ");
    }

    return {
      html: wrapper.innerHTML,
      isTruncated: reachedLimit
    };
  }

  const { html: truncatedHTML, isTruncated } = createTruncatedContent();

  if (!isTruncated) return;

  element.innerHTML = truncatedHTML;

  const btn = document.createElement("button");
  btn.textContent = "See more";
  btn.className = "comment-des-show-more-btn";

  btn.addEventListener("click", () => {
    if (btn.textContent === "See more") {
      element.innerHTML = originalHTML;
      btn.textContent = "See less";
      element.appendChild(btn);
    } else {
      const { html } = createTruncatedContent();
      element.innerHTML = html;
      btn.textContent = "See more";
      element.appendChild(btn);
    }
  });

  element.appendChild(btn);
}

function truncateLongCommentDescriptions() {
  const descriptions = document.querySelectorAll(".comment-des");
  descriptions.forEach((desc) => {
    truncateHTML(desc, 170, 5);
  });
}

$(document).ready(function () {
    const ACTION_REACT = 'react';
    const ACTION_UN_REACT = 'un_react';

    const $wrapper = $('#comment-wrapper');

    if (!$wrapper.length) return;

    const modelType = $wrapper.data('model');
    const modelId = $wrapper.data('id');

    setUpAjax();
    renderEditor();

    // Lazy-load comments when the section scrolls into view
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                observer.disconnect();
                loadComments(modelType, modelId);
            }
        }, { threshold: 0.1 });
        observer.observe($wrapper[0]);
    } else {
        loadComments(modelType, modelId);
    }

    $wrapper.on('click', '.comment-btn-action', async function (event) {
        const element = $(this);
        const disabled = element.hasClass('disabled');

        if (disabled) {
            return;
        }

        const commentId = element.data('comment');
        const isActive = element.hasClass('active');
        const type = element.data('type');
        const action = isActive ? ACTION_UN_REACT : ACTION_REACT;

        $('.comment-btn-action').prop('disabled', true);
        event.stopPropagation();

        // Update UI immediately for better UX
        const countElement = element.find('.react-count');
        const currentCount = parseInt(countElement.text()) || 0;

        if (action === ACTION_REACT) {
            // Remove active from other reactions on same comment
            element.closest('.comment-item').find('.comment-btn-action.active').each(function () {
                $(this).removeClass('active');
                const countEl = $(this).find('.react-count');
                const count = parseInt(countEl.text()) || 0;
                if (count > 0) countEl.text(count - 1);
            });
            element.addClass('active');
            countElement.text(currentCount + 1);
        } else {
            element.removeClass('active');
            countElement.text(currentCount - 1);
        }

        // Update IndexedDB
        if (isAuthenticated()) {
            const user = getCurrentUser();
            try {
                if (action === ACTION_REACT) {
                    await CommentDB.saveReaction({
                        reactor_id: user.id.toString(),
                        react_type: type,
                        comment_id: parseInt(commentId),
                    });
                } else {
                    await CommentDB.deleteReaction(parseInt(commentId));
                }
            } catch (e) {
                console.error('Failed to update IndexedDB:', e);
            }
        }

        // Send to server in background
        $.ajax({
            url: `/api/comments/${commentId}/react`,
            method: 'PUT',
            data: {
                action: action,
                react_type: type,
                _token: $('meta[name="csrf-token"]').attr('content')
            },
            success: function (response) {
                // Server response received, but UI already updated
                console.log('Reaction synced with server');
            },
            error: function (err) {
                console.error('Failed to sync reaction with server:', err);

                // Rollback UI changes on server error
                if (action === ACTION_REACT) {
                    element.removeClass('active');
                    countElement.text(currentCount);
                } else {
                    element.addClass('active');
                    countElement.text(currentCount + 1);
                }

                // Rollback IndexedDB changes
                if (isAuthenticated()) {
                    const user = getCurrentUser();
                    if (action === ACTION_REACT) {
                        CommentDB.deleteReaction(parseInt(commentId)).catch(console.error);
                    } else {
                        CommentDB.saveReaction({
                            reactor_id: user.id.toString(),
                            react_type: type,
                            comment_id: commentId,
                        }).catch(console.error);
                    }
                }
            },
            complete: function () {
                $('.comment-btn-action').prop('disabled', false);
            }
        });
    });
});

async function loadComments(modelType, modelId, isLoadMore = false, page = 1) {
    const direction = $("#sort-direction").attr('direction')
    let reactions = [];
    if (isAuthenticated()) {
        const user = getCurrentUser();
        try {
            reactions = await CommentDB.getReactionsByUserId(user.id);
        } catch (e) {
            console.log(e);
        }
    }
    await $.ajax({
        url: '/api/comments/list',
        method: 'GET',
        data: {
            commentable_type: modelType,
            commentable_id: modelId,
            page: page,
            direction: direction
        },
        success: function (response) {
            $('#comments-skeleton-container').hide();
            if (response.comment_count) {
                $('.comment-count').text(response.comment_count);
            }

            if (!response.comments || response.comments.total === 0) {
                $('#no-comments-template').show();
                return;
            }

            if (!isLoadMore) {
                $('.comment-item').remove();
                $('.comment-replies').remove();
                $('.load-more').remove();
            }

            response.comments.forEach(function(comment) {
                renderComment(comment);
            });

            if (response.pagination.has_more_pages) {
                const loadMoreHtml = `
                    <div class="load-more">
                        <button>
                        Load more
                        </button>
                        <svg class="arrow" width="12" height="6" viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11 1L6 5L0.999999 0.999999" stroke="#ED3849" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span class="spinner" style="display: none; margin-left: 5px;">
                            <svg width="16" height="16" viewBox="0 0 50 50">
                            <circle cx="25" cy="25" r="20" fill="none" stroke="#ED3849" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 150" stroke-dashoffset="0">
                                <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/>
                            </circle>
                            </svg>
                        </span>
                    </div>
                `;
                const $loadMore = $(loadMoreHtml.trim());

                // Add click event to button
                $loadMore.on('click', async function () {
                    const $button = $(this).find('button');
                    const $spinner = $(this).find('.spinner');
                    const $arrow = $(this).find('.arrow');
                    $button.prop('disabled', true);
                    $spinner.show();
                    $arrow.hide();

                    try {
                        await loadComments(modelType, modelId, true, response.pagination.current_page + 1);
                    } finally {
                        $spinner.hide();
                        $button.prop('disabled', false);
                        $arrow.show();
                        $(this).remove();
                    }
                });

                $('#comment-root').append($loadMore);
            }

            // Apply your existing post-processing
            if (!isFirstScrollToComment) {
                setTimeout(highlightCommentFromHash, 500);
            }

            truncateLongCommentDescriptions();
            applyReactionsToComments(reactions);
            applyCommentPermissions();
        },
        error: function (err) {
            console.error('Failed to load comments:', err);
            document.getElementById("comment-root").innerHTML = "<div class='alert alert-warning'>There are no comments yet.</div>"
        }
    });
}

window.onclick = function (event) {
  if (!event.target.matches(".dropbtn")) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      dropdowns[i].classList.remove("show");
    }
  }

  const isClickInsideButton = event.target.closest('.sort-by');

  if (!isClickInsideButton) {
    const dropdown = document.getElementById("dropdownSort")
    dropdown.classList.remove("show")
  }
};

function deleteComment(event, commentId) {
  event.stopPropagation();

  $(".dropdown-content").removeClass("show");

  $.ajax({
    url: `/api/comments/${commentId}/delete`,
    method: 'DELETE',
    data: {
      _token: $('meta[name="csrf-token"]').attr('content')
    },
    success: function (response) {
      if (response.status === 'ok') {
        const commentItem= document.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentItem) {
          $(commentItem).fadeOut(500, function () {
            const parentReplies = $(commentItem).closest('.comment-replies');
            if (parentReplies.length && parentReplies.children().length === 1) {
              parentReplies.remove();
            }
            commentItem.remove();
          });
        }
        const commentChildren = document.querySelectorAll(`[data-comment-parent-id="${commentId}"]`);
        commentChildren.forEach(child => {
          $(child).fadeOut(500, function () {
            child.remove();
          });
        });
        if (response.data.count) {
          $('.comment-count').text(response.data.count);
        }
      } else {
        ToastUI.error('Failed to delete comment: ' + response.message);
      }
    },
    error: function (err) {
      console.error('Failed to hide comment:', err);
    }
  });
}

function hideComment(event, commentId) {
  event.stopPropagation();

  $(".dropdown-content").removeClass("show");

  $.ajax({
    url: `/api/comments/hide/${commentId}`,
    method: 'POST',
    data: {
      _token: $('meta[name="csrf-token"]').attr('content')
    },
    success: function (response) {
      if (response.status === 'ok') {
        const commentItem= document.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentItem) {
          $(commentItem).fadeOut(500, function () {
            const parentReplies = $(commentItem).closest('.comment-replies');
            if (parentReplies.length && parentReplies.children().length === 1) {
              parentReplies.remove();
            }
            commentItem.remove();
          });
        }
        const commentChildren = document.querySelectorAll(`[data-comment-parent-id="${commentId}"]`);
        commentChildren.forEach(child => {
          $(child).fadeOut(500, function () {
            child.remove();
          });
        });

        if (response.data.count) {
          $('.comment-count').text(response.data.count);
        }
      } else {
        ToastUI.error('Failed to hide comment: ' + response.message);
      }
    },
    error: function (err) {
      console.error('Failed to hide comment:', err);
    }
  });
}

// Store current ban operation
let currentBanOperation = {
  userId: null,
  type: null,
  commentId: null,
  days: null,
  deleteAllComments: false
};

function banUserFromCommenting(event, commentId) {
  event.stopPropagation();
  $(".dropdown-content").removeClass("show");

  const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
  const userId = commentEl?.dataset?.commenterId;

  if (!userId) {
    ToastUI.error('User information not available');
    return;
  }

  currentBanOperation = { userId, type: 'comment', commentId, deleteAllComments: false };

  // Show ban modal
  document.getElementById('ban-modal-title').textContent = 'Ban User from Commenting';
  document.getElementById('ban-modal-message').textContent = 'How many days should this user be banned from commenting? (0 for permanent)';
  document.getElementById('ban-days').value = '7';
  document.getElementById('ban-delete-all-comments').checked = false;
  document.getElementById('ban-modal').style.display = 'flex';
}

function banUserFromSystem(event, commentId) {
  event.stopPropagation();
  $(".dropdown-content").removeClass("show");

  const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
  const userId = commentEl?.dataset?.commenterId;

  if (!userId) {
    ToastUI.error('User information not available');
    return;
  }

  currentBanOperation = { userId, type: 'system', commentId, deleteAllComments: false };

  // Show ban modal
  document.getElementById('ban-modal-title').textContent = 'Ban User from System';
  document.getElementById('ban-modal-message').textContent = 'How many days should this user be banned from the system? (0 for permanent)';
  document.getElementById('ban-days').value = '30';
  document.getElementById('ban-delete-all-comments').checked = false;
  document.getElementById('ban-modal').style.display = 'flex';
}

function closeBanModal() {
  document.getElementById('ban-modal').style.display = 'none';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('ban-confirm-btn').addEventListener('click', function() {
    const daysInput = document.getElementById('ban-days');
    const deleteAllCheckbox = document.getElementById('ban-delete-all-comments');
    const daysNum = parseInt(daysInput.value);
    const deleteAllComments = deleteAllCheckbox.checked;

    if (isNaN(daysNum) || daysNum < 0) {
      ToastUI.error('Please enter a valid number (0 or greater)');
      return;
    }

    const { type } = currentBanOperation;
    const isPermanent = daysNum === 0;
    const banType = type === 'comment' ? 'commenting' : 'the system';

    closeBanModal();

    document.getElementById('confirm-modal-title').textContent = isPermanent ? 'Permanent Ban' : 'Temporary Ban';
    let confirmMessage = isPermanent
      ? `Permanently ban this user from ${banType}?`
      : `Ban this user from ${banType} for ${daysNum} days?`;

    if (deleteAllComments) {
      confirmMessage += '\n\nAll comments from this user will be deleted.';
    }

    document.getElementById('confirm-modal-message').textContent = confirmMessage;
    document.getElementById('confirm-modal').style.display = 'flex';

    currentBanOperation.days = daysNum;
    currentBanOperation.deleteAllComments = deleteAllComments;
  });

  document.getElementById('confirm-modal-confirm-btn').addEventListener('click', function() {
    const { userId, type, days, deleteAllComments } = currentBanOperation;

    if (!userId || !type || days === undefined) {
      ToastUI.error('Invalid ban operation');
      closeConfirmModal();
      return;
    }

    const url = type === 'comment'
      ? `/api/admin/comments/ban-user/${userId}`
      : `/api/admin/comments/ban-user-general/${userId}`;

    closeConfirmModal();

    $.ajax({
      url: url,
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
        'Accept': 'application/json'
      },
      data: { days: days },
      success: function (response) {
        if (!response.success) {
          ToastUI.error('Failed to ban user: ' + response.message);
          return;
        }

        if (deleteAllComments) {
          $.ajax({
            url: `/api/admin/comments/user/${userId}/delete-all`,
            method: 'DELETE',
            headers: {
              'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
              'Accept': 'application/json'
            },
            success: function (deleteResponse) {
              if (deleteResponse.success) {
                const baseMessage = type === 'comment'
                  ? 'User banned from commenting'
                  : 'User banned from system';
                ToastUI.success(`${baseMessage} and ${deleteResponse.deleted_count} comment(s) deleted`);
              } else {
                ToastUI.error('Failed to delete comments: ' + deleteResponse.message);
              }
            },
            error: function (err) {
              console.error('Failed to delete comments:', err);
              ToastUI.error('User banned but failed to delete comments');
            }
          });
        } else {
          const successMessage = type === 'comment'
            ? 'User banned from commenting successfully'
            : 'User banned from system successfully';
          ToastUI.success(successMessage);
        }

        currentBanOperation = { userId: null, type: null, commentId: null, days: null };
      },
      error: function (err) {
        console.error('Failed to ban user:', err);
        ToastUI.error('Error banning user');
        // Reset ban operation on error too
        currentBanOperation = { userId: null, type: null, commentId: null, days: null };
      }
    });
  });
});

function onDropdownSortOpen() {
  const dropdown = document.getElementById("dropdownSort")
  dropdown.classList.toggle("show")
}

function onDropdownSortClose(displayText, orderDirection) {
  const dropdown = document.getElementById("dropdownSort")
  dropdown.classList.remove("show")

  $("#sort-direction").text(displayText);
  $("#sort-direction").attr('direction', orderDirection)

  const $wrapper = $('#comment-wrapper');

  if (!$wrapper.length) return;

  const modelType = $wrapper.data('model');
  const modelId = $wrapper.data('id');

  loadComments(modelType, modelId, false, 1);
}

function setUpAjax() {
  $.ajaxSetup({
    statusCode: {
      401: function (xhr) {
        let response = xhr.responseJSON;
        if (response && response.redirect_url) {
          window.location.href = response.redirect_url;
        } else {
          ToastUI.error('Session expired. Please log in again.');
        }
      },
      419: function (xhr) {
        let response = xhr.responseJSON;
        if (response && response.redirect_url) {
          window.location.href = response.redirect_url;
        } else {
          ToastUI.error('Session expired. Please log in again.');
        }
      },
      422: function (xhr) {
        let response;
        if (xhr.responseJSON) {
            response = xhr.responseJSON; // Use if available
        } else if (xhr.responseText) {
            try {
                response = JSON.parse(xhr.responseText); // Parse manually
            } catch (e) {
                ToastUI.error('The given data was invalid.');
            }
        }

        if (response.errors) {
          const errors = response.errors
          for (const key in errors) {
            if (Array.isArray(errors[key]) && errors[key].length > 0) {
              ToastUI.error(errors[key][0])
            }
          }
        } else {
            ToastUI.error('The given data was invalid.');
        }
      },
      429: function(xhr) {
        let retryAfter = xhr.getResponseHeader('Retry-After');

          // Fallback: some APIs return retry info in JSON
          if (!retryAfter && xhr.responseJSON?.retry_after_seconds) {
              retryAfter = xhr.responseJSON.retry_after_seconds;
          }

        ToastUI.error(`Rate limit reached. You can react again in ${retryAfter} seconds.`);
      }
    }
  });
}

async function renderEditor() {
  try {
    const isLoggedIn = isAuthenticated();
    $('#editor-skeleton').hide();

    if (isLoggedIn) {
        const user = getCurrentUser();

        if (isUserCommentBanned(user)) {
            $('#editor-container').hide();
            $('#editor-require-login').hide();

            let $bannedContainer = $('#editor-banned-message');
            if ($bannedContainer.length === 0) {
                $bannedContainer = $('<div id="editor-banned-message"></div>');
                $('#editor-wrapper').append($bannedContainer);
            }

            const bannedHtml = getBannedMessageHtml(user);
            $bannedContainer.html(bannedHtml).show();
        } else {
            $('#editor-banned-message').hide();
            $('#editor-container').show();
            if (typeof initEditor === 'function') {
                initEditor();
            }
        }
    } else {
        $('#editor-require-login').show();
    }
  } catch {
    // User of comment editor can override this place to render error component in case of api fail
  }
}

function getBannedMessageHtml(user) {
    const isPermanent = user.is_comment_permanently_banned;
    const bannedUntil = user.comment_banned_until;

    let message;
    if (isPermanent) {
        message = 'You have been permanently banned from commenting on this site.';
    } else if (bannedUntil) {
        const banDate = new Date(bannedUntil);
        const formattedDate = banDate.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        message = `You are banned from commenting until ${formattedDate}`;
    } else {
        message = 'You are currently banned from commenting.';
    }

    return `
        <div class="banned-message">
            <div class="banned-content">
                <h3>You are banned from commenting</h3>
            </div>
        </div>
    `;
}

function applyReactionsToComments(reactions) {
    if (!reactions || reactions.length === 0) return;

    const reactionMap = {};
    reactions.forEach(reaction => {
        reactionMap[reaction.comment_id] = reaction.react_type;
    });

    document.querySelectorAll('.comment-item').forEach(commentEl => {
        const commentId = commentEl.dataset.commentId;
        const userReaction = reactionMap[commentId];

        if (userReaction) {
            commentEl.querySelectorAll('.comment-btn-action').forEach(btn => {
                btn.classList.remove('active');
            });

            const activeBtn = commentEl.querySelector(`[data-type="${userReaction}"]`);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        }
    });
}


function applyCommentPermissions() {
    let isLoggedIn = false;
    let currentUserId = null;
    let isAdmin = false;
    const currentUser = getCurrentUser();
    if (currentUser) {
        isLoggedIn = true;
        currentUserId = currentUser.id;
        isAdmin = currentUser.is_admin;
    }

    document.querySelectorAll('.comment-item').forEach(commentEl => {
        const commenterId = parseInt(commentEl.dataset.commenterId) || 0;
        const commentId = commentEl.dataset.commentId;

        // Reply button permissions
        const replyBtn = commentEl.querySelector('.btn-reply');
        const replyTooltip = commentEl.querySelector('.btn-reply .tooltip');
        if (replyBtn) {
            if (isLoggedIn) {
                replyBtn.classList.remove('disabled');
                if (replyTooltip) replyTooltip.style.display = 'none';
            } else {
                replyBtn.classList.add('disabled');
                if (replyTooltip) replyTooltip.style.display = 'block';
            }
        }

        // Dropdown visibility
        const dropdown = commentEl.querySelector('.more.dropdown');
        if (dropdown) {
            const hasVisibleAction = hasAnyVisibleDropdownAction(commenterId, currentUserId, isAdmin);
            dropdown.style.display = hasVisibleAction ? 'block' : 'none';
        }

        // Edit button
        const editBtn = commentEl.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.style.display = canEditComment(commenterId, currentUserId) ? 'block' : 'none';
        }

        // Delete button
        const deleteBtn = commentEl.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.style.display = canDeleteComment(commenterId, currentUserId) ? 'block' : 'none';
        }

        // Hide button (moderation)
        const hideBtn = commentEl.querySelector('.hide-btn');
        if (hideBtn) {
            hideBtn.style.display = canHideComment(isAdmin) ? 'block' : 'none';
        }

        const banCommentBtn = commentEl.querySelector('.ban-comment-btn');
        if (banCommentBtn) {
            banCommentBtn.style.display = canHideComment(isAdmin) ? 'block' : 'none';
        }

        const banUserBtn = commentEl.querySelector('.ban-user-btn');
        if (banUserBtn) {
            banUserBtn.style.display = canHideComment(isAdmin) ? 'block' : 'none';
        }

        // Report button
        const reportBtn = commentEl.querySelector('.report-btn');
        if (reportBtn) {
            const canReport = isLoggedIn && currentUserId !== commenterId;
            reportBtn.style.display = canReport ? 'block' : 'none';
        }
    });
}

// Refactor based on different sites
function isAuthenticated() {
	return Auth?.isAuthenticated();
}

// Refactor based on different sites
function getCurrentUser() {
	return Auth?.getProfile();
}

/**
 * Check if a user is currently banned from commenting.
 * @param {Object|null} user - The user object
 * @returns {boolean} True if the user is banned from commenting
 */
function isUserCommentBanned(user) {
    if (!user) return false;
    return user.is_comment_permanently_banned ||
            user.is_user_permanently_banned ||
            (user.user_banned_to && new Date(user.user_banned_to) > new Date()) ||
            (user.comment_banned_to && new Date(user.comment_banned_to) > new Date());
}

/**
 * Get the display name for a commenter. Returns "Banned User" if the user is banned.
 * @param {Object} commenter - The commenter object
 * @returns {string} The display name to show
 */
function getCommenterDisplayName(commenter) {
    if (!commenter) return 'Unknown User';
    if (isUserCommentBanned(commenter)) return 'Banned User';
    return commenter.name || 'Unknown User';
}

function canEditComment(commenterId, currentUserId) {
    return currentUserId && currentUserId === commenterId;
}

function canDeleteComment(commenterId, currentUserId) {
    return currentUserId && currentUserId === commenterId;
}

function canHideComment(isAdmin) {
    return isAdmin;
}

function hasAnyVisibleDropdownAction(commenterId, currentUserId, isAdmin) {
    return canEditComment(commenterId, currentUserId) ||
           canDeleteComment(commenterId, currentUserId) ||
           canHideComment(isAdmin) ||
           (currentUserId && currentUserId !== commenterId);
}

function highlightCommentFromHash() {
    const hash = window.location.hash;
    if (hash && hash.match(/^#comment-\d+$/)) {
        const element = document.getElementById(hash.substring(1));
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('comment-highlighted');
            isFirstScrollToComment = true;
        }
    }
}

function renderComment(comment, isAppending = true) {
    // Clone the comment template
    const template = $('#comments-list-template').clone();
    template.removeAttr('id').removeAttr('hidden').show();

    // Get the main comment item
    const commentItem = template.find('.comment-item-template').first();

    // Set basic attributes
    commentItem.attr('id', `comment-${comment.id}`);
    commentItem.attr('data-comment-id', comment.id);
    commentItem.attr('data-commenter-id', comment.commenter.id);
    commentItem.addClass('comment-item');
    commentItem.removeClass('comment-item-template');

    // Handle avatar
    const avatarImg = commentItem.find('.avatar img');
    const avatarText = commentItem.find('.avatar-text');

    const displayName = getCommenterDisplayName(comment.commenter);

    if (comment.commenter.avata) {
        avatarImg.attr('id', `comment-avatar-${comment.id}`);
        avatarImg.attr('src', comment.commenter.avata).show();
        avatarImg.parent().show();
        avatarText.hide();
    } else {
        const initial = displayName.charAt(0).toUpperCase();
        avatarText.text(initial).show();
        avatarImg.parent().hide();
    }

    commentItem.find('.name').text(displayName);
    commentItem.find('.time').text(formatTimeAgo(comment.created_at));
    commentItem.find('.comment-des').html(comment.content);

    // Update react buttons with actual data
    commentItem.find('.comment-btn-action').each(function() {
        const reactType = $(this).attr('data-react-type');
        $(this).attr('data-comment', comment.id);
        $(this).find('.react-count').text(comment[reactType + '_count'] || 0);

        if (isAuthenticated()) {
            $(this).removeClass('disabled');
        }
    });

    // Update action buttons with comment ID
    commentItem.find('.hide-btn').attr('onclick', `hideComment(event, ${comment.id})`);
    commentItem.find('.ban-comment-btn').attr('onclick', `banUserFromCommenting(event, ${comment.id})`);
    commentItem.find('.ban-user-btn').attr('onclick', `banUserFromSystem(event, ${comment.id})`);
    commentItem.find('.report-btn').attr('onclick', `openReportModal(event, ${comment.id})`);
    commentItem.find('.report-btn').attr('data-comment-id', comment.id);
    commentItem.find('.delete-btn').attr('onclick', `deleteComment(event, ${comment.id})`);

    // Handle children comments
    const repliesContainer = template.find('.comment-replies-template');
    repliesContainer.addClass('comment-replies');
    repliesContainer.removeClass('comment-replies-template');
    if (comment.children && comment.children.length > 0) {
        repliesContainer.attr('data-comment-parent-id', comment.id);

        // Get child comment template and clear placeholder
        const childCommentTemplate = repliesContainer.find('.comment-item-template').first();
        repliesContainer.empty();

        comment.children.forEach(function(child) {
            const childComment = childCommentTemplate.clone();
            populateChildComment(childComment, child);
            repliesContainer.append(childComment);
        });
    } else {
        repliesContainer.remove();
    }

    // Append to comment root
    if (isAppending) {
        $('#comment-root').append(template.html());
    } else {
        $('#comment-root').prepend(template.html());
    }
}

function populateChildComment(childElement, childComment) {
    // Set basic attributes
    childElement.attr('id', `comment-${childComment.id}`);
    childElement.attr('data-comment-id', childComment.id);
    childElement.attr('data-commenter-id', childComment.commenter.id);
    childElement.addClass('comment-item');
    childElement.removeClass('comment-item-template');

    // Handle avatar
    const avatarImg = childElement.find('.avatar img');
    const avatarText = childElement.find('.avatar-text');

    const displayName = getCommenterDisplayName(childComment.commenter);

    if (childComment.commenter.avata) {
        avatarImg.attr('id', `comment-avatar-${childComment.id}`);
        avatarImg.attr('src', childComment.commenter.avata).show();
        avatarImg.parent().show();
        avatarText.hide();
    } else {
        const initial = displayName.charAt(0).toUpperCase();
        avatarText.text(initial).show();
        avatarImg.parent().hide();
    }

    // Set comment data
    childElement.find('.name').text(displayName);
    childElement.find('.time').text(formatTimeAgo(childComment.created_at));
    childElement.find('.comment-des').html(childComment.content);

    // Update react buttons and actions (same as parent)
    childElement.find('.comment-btn-action').each(function() {
        const reactType = $(this).attr('data-react-type');
        $(this).attr('data-comment', childComment.id);
        $(this).find('.react-count').text(childComment[reactType + '_count'] || 0);

        if (window.isLoggedIn) {
            $(this).removeClass('disabled');
        }
    });

    // Update action buttons
    childElement.find('.hide-btn').attr('onclick', `hideComment(event, ${childComment.id})`);
    childElement.find('.ban-comment-btn').attr('onclick', `banUserFromCommenting(event, ${childComment.id})`);
    childElement.find('.ban-user-btn').attr('onclick', `banUserFromSystem(event, ${childComment.id})`);
    childElement.find('.report-btn').attr('onclick', `openReportModal(event, ${childComment.id})`);
    childElement.find('.report-btn').attr('data-comment-id', childComment.id);
    childElement.find('.delete-btn').attr('onclick', `deleteComment(event, ${childComment.id})`);
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + ' minutes ago';
    if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + ' hours ago';
    if (diffInSeconds < 2592000) return Math.floor(diffInSeconds / 86400) + ' days ago';
    if (diffInSeconds < 31536000) return Math.floor(diffInSeconds / 2592000) + ' months ago';
    return Math.floor(diffInSeconds / 31536000) + ' years ago';
}

function renderChildComment(comment, $repliesContainer) {
  // Get the child comment template from the main template
  const $mainTemplate = $('#comments-list-template');
  const $childTemplate = $mainTemplate.find('.comment-replies-template .comment-item-template').first().clone();

  // Populate the child comment using the existing function
  populateChildComment($childTemplate, comment);

  // Apply truncation to the new comment
  const commentDes = $childTemplate.find('.comment-des')[0];
  if (commentDes) {
    truncateHTML(commentDes, 170, 5);
  }

  // Append to replies container
  $repliesContainer.append($childTemplate);
}
