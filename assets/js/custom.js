document.addEventListener("DOMContentLoaded", () => {
	const formMessage = document.getElementById('form-message');

	  document.getElementById("contact-form").addEventListener("submit", async (e) => {
	  e.preventDefault();

	  const form = e.target;
	  const submitBtn = form.querySelector('button[type="submit"]');

	  // Collect the selected services (checkboxes) — at least one is required
	  const services = Array.from(
		form.querySelectorAll('input[name="services"]:checked')
	  ).map((cb) => cb.value);

	  if (services.length === 0) {
		showContactMessage("Please select at least one service you're interested in.", false);
		return;
	  }

	  submitBtn.textContent = 'Sending...';
	  submitBtn.disabled = true;

	  try {
		const token = await new Promise((resolve, reject) => {
		  grecaptcha.ready(() => {
			grecaptcha.execute(window.recaptchaSiteKey, { action: 'contact' }).then(resolve).catch(reject);
		  });
		});

		const businessType = document.getElementById("business_type").value;
		const phone = document.getElementById("phone").value.trim();

		// Build a readable summary so the existing backend/email keeps working.
		// Phone is appended here because the leads table has no phone column.
		const message =
		  `Phone: ${phone || "N/A"}\n` +
		  `Business type: ${businessType || "N/A"}\n` +
		  `Interested in: ${services.length ? services.join(", ") : "N/A"}`;

		const payload = {
		  name: document.getElementById("name").value.trim(),
		  business_name: document.getElementById("business").value.trim(),
		  email: document.getElementById("email").value.trim(),
		  phone: phone,
		  business_type: businessType,
		  services: services,
		  message: message,
		  recaptcha_token: token
		};

		const res = await fetch("/api/contact", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify(payload)
		});

		if (!res.ok) throw new Error();

		// Fire Meta Pixel Lead event on successful submission
		if (typeof fbq === "function") {
		  fbq('track', 'Lead');
		}

		showContactMessage("Thanks! We'll contact you soon.", true);
	  } catch (err) {
		showContactMessage("Something went wrong. Please try again.", false);
	  } finally {
		// Clear the form whether the submission succeeded or failed
		try {
			form.reset();
			submitBtn.textContent = 'Start My Project';
		} catch (e) {}
	  }
	});

	// helper to display inline success/error messages
	function showContactMessage(text, status) {
		setTimeout(() => {
			 if (status) {
			  formMessage.className = 'mt-6 text-center text-lg font-medium text-green-600';
			} else {
			  formMessage.className = 'mt-6 text-center text-lg font-medium text-red-600';
			}
			formMessage.textContent = text;
		}, 1000);
	}
});

//Mobile menu
	document.addEventListener('DOMContentLoaded', function() {
		const menuBtn = document.getElementById("menu-btn");
		  const mobileMenu = document.getElementById("mobile-menu");

		  menuBtn.addEventListener("click", () => {
			mobileMenu.classList.toggle("hidden");
		  });

		  //hide mobile menu on click
		  document.querySelectorAll("#mobile-menu a").forEach(link => {
		  link.addEventListener("click", () => {
			mobileMenu.classList.add("hidden");
		  });
		});
	});

