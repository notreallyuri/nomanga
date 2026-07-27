function format(event, command, type) {
  const editorWrapper = document.querySelector(`#editor-root.${type}`);
  const editor = editorWrapper.querySelector(`#editor`);

  editor.focus();
  document.execCommand(command, false, null);

  updateToolbarButtonState(editorWrapper);
}

async function submitComment(isReply) {
  if (!checkRemainingTimeForSubmit()) {
    return;
  }

  const $btn = $('#submit-comment'); // adjust if your button has a different selector
  $btn.prop('disabled', true); // Disable the button

  let content = $(".editor.post").html();
  if (isReply) {
    content = $(".editor.reply").html();
  }

  let pureText = $(".editor.post").text();
  if (isReply) {
    pureText = $(".editor.reply").text();
  }

  const $editor = $('#editor');
  const minLength = parseInt($editor.data('minlength'));
  const errorMessage = $editor.data('minlength_message');

  if (!(hasSticker(content)) && !validateContentLength(minLength, pureText)) {
    ToastUI.error(errorMessage);
    $btn.prop('disabled', false); // Re-enable if wrapper not found
    return;
  }

  const $commentWrapper = $('#comment-wrapper');
  if (!$commentWrapper.length) {
    $btn.prop('disabled', false); // Re-enable if wrapper not found
    return;
  }

  const modelType = $commentWrapper.data('model');
  const modelId = $commentWrapper.data('id');

  try {
    await sendComment(modelType, modelId, content); // Await the async call
    setRemainingTime();
  } catch {
    $btn.prop('disabled', false);
  }
   finally {
    $btn.prop('disabled', true); // Always re-enable the button
  }
}

function hasSticker(html) {
  return /<img[^>]*data-sticker="[^"]+"[^>]*>/.test(html);
}

function validateContentLength(minLength, content) {
  if (content.trim().length > minLength) {
    return true;
  }

  return false;
}

function extractContent(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  const images = container.querySelectorAll('img');
  images.forEach(img => {
    const stickerName = img.getAttribute('data-sticker');
    if (stickerName) {
      img.replaceWith(document.createTextNode(`${stickerName}`));
    } else {
      img.remove();
    }
  });

  return container.innerHTML;
}

async function sendComment(modelType, modelId, content) {
  const validatedContent = extractContent(content);
  return $.ajax({
    url: '/api/comments/create',
    method: 'POST',
    data: {
      commentable_type: modelType,
      commentable_id: modelId,
      content: validatedContent,
      _token: $('meta[name="csrf-token"]').attr('content') // for Laravel CSRF
    },
    success: function(response) {
      if (response.status === 'ok' && response.data.comment) {
        // Use template-based rendering instead of HTML injection
        renderComment(response.data.comment, false);

        // Clear editor and remove no-comment message
        $('.editor.post').html('');
        $('.no-comment-wrapper').remove();
        $('#no-comments-template').hide();

        // Apply permissions and update count
        applyCommentPermissions();

        if (response.data.count) {
          $('.comment-count').text(response.data.count);
        }
      }
    },
    error: function(xhr) {
      console.error('Failed to send comment:', xhr.responseJSON || xhr.statusText);
    }
  });
}

document.addEventListener("click", function (e) {
  const pickers = document.querySelectorAll(".emoji-picker");
  pickers.forEach((picker) => {
    if (!picker.contains(e.target)) {
      picker.classList.remove("open");
    }
  });
});

window.initEditor = async function () {
  await getAvailableEmojis();
  const postEditorContainer = document.querySelector("#editor-root.post");
  initOnValueChange($('#editor.post'));
  attachEditorEvents(postEditorContainer);
  initEmojiPicker(postEditorContainer);
  initStickerPicker(postEditorContainer);
}

async function getAvailableEmojis() {
  try {
    const response = await $.ajax({
      url: '/api/emojis',
      method: 'GET',
    });

    if (response.status === 'ok' && Array.isArray(response.data.emojis)) {
      const emojis = response.data.emojis;

      $('.sticker-picker').each(function () {
        const picker = $(this);
        picker.empty();

        emojis.forEach(emoji => {
          const img = $('<img>', {
            src: emoji.url,
            class: 'sticker',
            alt: emoji.name,
            'data-sticker': `:sticker_${emoji.name}:`
          });

          picker.append(img);
        });
      });
    }
  } catch (error) {
    console.error('Failed to load emojis:', error);
  }
}

function initOnValueChange($editor) {
    const minLength = parseInt($editor.data('minlength'));

    $editor.on('input', function () {
    const text = $.trim($(this).text());
    const html = $(this).html();

    if (!(hasSticker(html)) && !validateContentLength(minLength, text)) {
        $editor.next('.toolbar').find('#submit-comment').prop('disabled', true);
      } else {
      $editor.next('.toolbar').find('#submit-comment').prop('disabled', false);
    }
})};

function initEmojiPicker(container) {
  const emojiTriggerBtn = container.querySelector("#emoji-trigger");
  const output = container.querySelector("#editor");

  if (!emojiTriggerBtn || !output) return;

  const picker = new EmojiButton({
    position: "top-start",
    showCategories: false,
    showSearch: false,
    showRecents: false,
    autoHide: false,
    showPreview: false,
  });

  emojiTriggerBtn.addEventListener("click", () => {
    picker.togglePicker(emojiTriggerBtn);
  });

  picker.on("emoji", (emoji) => {
    if (output.innerHTML.trim() === "" || output.innerHTML === "<br>") {
      output.innerHTML = "";
      output.classList.remove("empty");
    }
    output.innerHTML += emoji;
    output.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function checkEmpty() {
    if (output.innerHTML.trim() === "" || output.innerHTML === "<br>") {
      output.classList.add("empty");
    } else {
      output.classList.remove("empty");
    }
  }

  output.addEventListener("input", checkEmpty);
  checkEmpty();
}

function initStickerPicker(container) {
  const stickerBtn = container.querySelector("#sticker-btn");
  const picker = container.querySelector("#sticker-picker");
  const output = container.querySelector("#editor");

  if (!stickerBtn || !picker || !output) return;

  stickerBtn.addEventListener("click", () => {
    picker.style.display = picker.style.display === "grid" ? "none" : "grid";
  });

  container.querySelectorAll(".sticker").forEach((sticker) => {
    sticker.addEventListener("click", () => {
      const img = document.createElement("img");
      img.src = sticker.src;
      img.width = 24;
      img.height = 24;
      img.style.display = "inline-block";

      // Get sticker name from data-sticker attribute
      const stickerName = sticker.getAttribute("data-sticker") || "sticker";

      // Add attributes
      img.setAttribute("alt", `${stickerName}`);
      img.setAttribute("data-sticker", stickerName);
      img.classList.add("sticker");

      if (output.innerHTML.trim() === "" || output.innerHTML === "<br>") {
        output.innerHTML = "";
        output.classList.remove("empty");
      }

      output.appendChild(img);
      $(output).next('.toolbar').find('#submit-comment').prop('disabled', false);
      picker.style.display = "none";
      output.focus();
    });
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target) && !stickerBtn.contains(e.target)) {
      picker.style.display = "none";
    }
  });
}

function updateToolbarButtonState(editorWrapper) {
  const buttons = {
    bold: editorWrapper.querySelector('.btn-format.bold'),
    italic: editorWrapper.querySelector('.btn-format.italic'),
    underline: editorWrapper.querySelector('.btn-format.underline')
  };

  const formats = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline')
  };

  Object.keys(buttons).forEach((format) => {
    if (buttons[format]) {
      if (formats[format]) {
        buttons[format].classList.add('active');
      } else {
        buttons[format].classList.remove('active');
      }
    }
  });
}

function handleEnterKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const br = document.createElement("br");
    const zwsp = document.createTextNode("\u200B"); // Zero-width space

    range.insertNode(br);
    range.collapse(false);
    range.insertNode(zwsp);

    const newRange = document.createRange();
    newRange.setStartAfter(zwsp);
    newRange.setEndAfter(zwsp);
    selection.removeAllRanges();
    selection.addRange(newRange);

    const dummy = document.createElement("span");
    dummy.style.display = "inline-block";
    dummy.style.width = "1px";
    dummy.style.height = "1em";
    dummy.style.visibility = "hidden";
    newRange.insertNode(dummy);
    dummy.scrollIntoView({ behavior: "smooth", block: "nearest" });
    dummy.remove();
  }
}

function attachEditorEvents(editorWrapper) {
  const editor = editorWrapper.querySelector('.editor');
  if(!editor) return;

  editor.addEventListener('click', () => {
    updateToolbarButtonState(editorWrapper);
  });

  editor.addEventListener('keyup', () => {
    updateToolbarButtonState(editorWrapper);
  });

  editor.addEventListener('keydown', (e) => {
    handleEnterKeydown(e);
  })

  editor.addEventListener('paste', (e) => {
    if (!e.clipboardData) return;

    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        return;
      }
    }
  });
}
