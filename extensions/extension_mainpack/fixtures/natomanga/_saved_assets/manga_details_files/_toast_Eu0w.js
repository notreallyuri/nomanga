var ToastUI = {
    name: 'Toast',
    type: {
        info: 'info',
        success: 'success',
        error: 'error',
        warning: 'warning'
    },
    show: function (message, type, duration) {
        type = type || this.type.info; // set default value for type
        duration = duration || 5000; // set default value for duration

        if (document.querySelector('.toast-notification')) {
            return;
        }

        var toastElement = document.createElement("div");
        toastElement.className = "comment-toast-notification";
        toastElement.setAttribute("status", type);

        var messageElement = document.createElement("div");
        messageElement.className = "comment-toast-notification-message";
        messageElement.innerText = message;

        var closeButton = document.createElement("button");
        closeButton.className = "comment-toast-notification-close";
        closeButton.innerHTML = "&times;";

        toastElement.appendChild(messageElement);
        toastElement.appendChild(closeButton);
        document.body.appendChild(toastElement);

        if (duration > 0) {
            setTimeout(function () {
                ToastUI.hideAll();
            }, duration);
        }
    },
    info: function (message) {
        this.show(message, this.type.info);
    },
    success: function (message) {
        this.show(message, this.type.success);
    },
    error: function (message) {
        this.show(message, this.type.error);
    },
    warning: function (message) {
        this.show(message, this.type.warning);
    },
    hideElementId: function (id) {
        var toast = document.getElementById(id);
        if (toast) {
            toast.remove();
        }
    },
    hideAll: function () {
        var toasts = document.querySelectorAll('.comment-toast-notification');
        toasts.forEach(function (toast) {
            toast.remove();
        });
    }
};

document.addEventListener('DOMContentLoaded', function () {
    document.body.addEventListener('click', function (e) {
        if (e.target.classList.contains('comment-toast-notification-close')) {
            e.target.parentElement.remove();
        }
    });
});
