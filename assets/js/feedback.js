// Sends the feedback form to the Worker in worker/, keeping the visitor on the page.
(function () {
  'use strict';
  const form = document.getElementById('feedback-form');
  if (!form) return;
  const status = document.getElementById('feedback-status');
  const button = form.querySelector('button');
  const problems = {
    rate: "That's a few messages in a row. Wait a minute and try again.",
    email: "That email address doesn't look right.",
    message: 'Your message is empty or too long.',
  };
  const fallback = "Couldn't send that. Please email contact@widgetthemes.com instead.";

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      form.reset();
      status.textContent = 'Sent. Thank you!';
    } catch (error) {
      // Whatever was typed stays in the form.
      status.textContent = problems[error.message] || fallback;
    } finally {
      button.disabled = false;
    }
  });
})();
