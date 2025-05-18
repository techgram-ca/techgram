const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');

  form.addEventListener('submit', function(event) {
    event.preventDefault();

    const data = new FormData(form);
    fetch('https://formspree.io/f/mvgaypvv', {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      },
      body: data
    }).then(response => {
      if (response.ok) {
        status.innerHTML = "Thanks for your message! We will get back to you soon";
        form.reset();
      } else {
        response.json().then(data => {
          if (data.errors) {
            status.innerHTML = data.errors.map(error => error.message).join(", ");
          } else {
            status.innerHTML = "Oops! There was a problem submitting your form.";
          }
        });
      }
    }).catch(() => {
      status.innerHTML = "Oops! There was a problem submitting your form.";
    });
  });
