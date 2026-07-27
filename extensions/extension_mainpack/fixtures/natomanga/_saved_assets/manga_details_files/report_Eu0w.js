/*!
  QQ Comment Service v1.1.0
 */

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function onModalOverlayClick(event) {
  const modalContent = document.querySelector(".modal-content");
  if (!modalContent.contains(event.target)) {
    closeReportModal();
  }
}

function onReportTypeChange(radio) {
  const isOther = radio.value === 'other';
  const otherBox = document.getElementById('other-reason-container');
  otherBox.style.display = isOther ? 'block' : 'none';
}

async function submitReport() {
  const commentId = document.getElementById('report-comment-id').value;
  const selectedType = document.querySelector('input[name="report-type"]:checked');
  const reasonInput = document.getElementById('report-reason');
  const reason = selectedType?.value === 'other' ? reasonInput.value.trim() : '';

  const btnSubmit = document.querySelector('.modal-actions .report-btn');
  const btnCancel = document.querySelector('.modal-actions .cancel-btn');

  if (!selectedType) {
      ToastUI.info("Please select a reason.");
      return;
  }

  if (selectedType.value === 'other' && reason === '') {
      ToastUI.info("Please enter your reason.");
      return;
  }

  btnSubmit.disabled = true;
  btnCancel.disabled = true;
  const originalContent = btnSubmit.innerHTML;
  btnSubmit.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center;">
      <span class="spinner" margin-left: 5px;">
        <svg width="16" height="16" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 150" stroke-dashoffset="0">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </span>
    </div>`;

  try {
    await $.ajax({
      url: `/api/comments/${commentId}/report`,
      method: 'POST',
      data: {
        type: selectedType.value,
        reason: reason,
        page_url: window.location.href.split('#')[0],
        _token: $('meta[name="csrf-token"]').attr('content') // for Laravel CSRF
      },
      success: function(response) {
        if (response.status === 'ok' && response.data.message) {
          ToastUI.success(response.data.message)
        } else {
          ToastUI.success("Our moderators will review the reported content within 24-48 hours")
        }
      },
      error: function(xhr) {
        ToastUI.error("Failed to send report");
      }
    });
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalContent;

    btnCancel.disabled = false;

    closeReportModal();
  }
}
