function filterFacilities() {
    var input, filter, cards, card, h3, txtValue;
    input = document.getElementById('search');
    filter = input.value.toUpperCase();
    cards = document.getElementsByClassName('card');

    for (var i = 0; i < cards.length; i++) {
        card = cards[i];
        h3 = card.getElementsByTagName('h3')[0];
        txtValue = h3.textContent || h3.innerText;

        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    }
}

function filterBy(filterType) {
    var referrals = document.querySelectorAll('.in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterReferrals(referrals, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterReferrals(referrals, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterReferrals(referrals, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllReferrals(referrals);
            break;
        default:
            break;
    }
}

function filterReferrals(referrals, startDate, endDate) {
    referrals.forEach(function (referral) {
        var referralDate = new Date(referral.dataset.date); // Parse referral date from dataset
        if (referralDate >= startDate && referralDate <= endDate) {
            referral.style.display = ''; // Show referral
        } else {
            referral.style.display = 'none'; // Hide referral
        }
    });
}

function showAllReferrals(referrals) {
    referrals.forEach(function (referral) {
        referral.style.display = ''; // Show all referrals
    });
}

// Incoming
function filterIncomingBy(filterType) {
    var incomingReferrals = document.querySelectorAll('#referralInContainer .in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingReferrals(incomingReferrals, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingReferrals(incomingReferrals, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingReferrals(incomingReferrals, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllIncomingReferrals(incomingReferrals);
            break;
        default:
            break;
    }
}

function filterIncomingReferrals(incomingReferrals, startDate, endDate) {
    incomingReferrals.forEach(function (incomingReferral) {
        var referralDate = new Date(incomingReferral.dataset.date); // Parse referral date from dataset
        if (referralDate >= startDate && referralDate <= endDate) {
            incomingReferral.style.display = ''; // Show incoming referral
        } else {
            incomingReferral.style.display = 'none'; // Hide incoming referral
        }
    });
}

function showAllIncomingReferrals(incomingReferrals) {
    incomingReferrals.forEach(function (incomingReferral) {
        incomingReferral.style.display = ''; // Show all incoming referrals
    });
}

// Consultation
function filterConsultationsBy(filterType) {
    var consultations = document.querySelectorAll('#consultationContainer .in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterConsultations(consultations, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterConsultations(consultations, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterConsultations(consultations, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllConsultations(consultations);
            break;
        default:
            break;
    }
}

function filterConsultations(consultations, startDate, endDate) {
    consultations.forEach(function (consultation) {
        var consultationDate = new Date(consultation.dataset.date); // Parse consultation date from dataset
        if (consultationDate >= startDate && consultationDate <= endDate) {
            consultation.style.display = ''; // Show consultation
        } else {
            consultation.style.display = 'none'; // Hide consultation
        }
    });
}

function showAllConsultations(consultations) {
    consultations.forEach(function (consultation) {
        consultation.style.display = ''; // Show all consultations
    });
}

// Incomi ng consultations
function filterIncomingConsultationsBy(filterType) {
    var incomingConsultations = document.querySelectorAll('#consultationInContainer .in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingConsultations(incomingConsultations, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingConsultations(incomingConsultations, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingConsultations(incomingConsultations, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllIncomingConsultations(incomingConsultations);
            break;
        default:
            break;
    }
}

function filterIncomingConsultations(incomingConsultations, startDate, endDate) {
    incomingConsultations.forEach(function (incomingConsultation) {
        var consultationDate = new Date(incomingConsultation.dataset.date); // Parse consultation date from dataset
        if (consultationDate >= startDate && consultationDate <= endDate) {
            incomingConsultation.style.display = ''; // Show incoming consultation
        } else {
            incomingConsultation.style.display = 'none'; // Hide incoming consultation
        }
    });
}

function showAllIncomingConsultations(incomingConsultations) {
    incomingConsultations.forEach(function (incomingConsultation) {
        incomingConsultation.style.display = ''; // Show all incoming consultations
    });
}

// Specimen
function filterSpecimensBy(filterType) {
    var specimens = document.querySelectorAll('#specimenContainer .in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterSpecimens(specimens, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterSpecimens(specimens, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterSpecimens(specimens, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllSpecimens(specimens);
            break;
        default:
            break;
    }
}

function filterSpecimens(specimens, startDate, endDate) {
    specimens.forEach(function (specimen) {
        var specimenDate = new Date(specimen.dataset.date); // Parse specimen date from dataset
        if (specimenDate >= startDate && specimenDate <= endDate) {
            specimen.style.display = ''; // Show specimen
        } else {
            specimen.style.display = 'none'; // Hide specimen
        }
    });
}

function showAllSpecimens(specimens) {
    specimens.forEach(function (specimen) {
        specimen.style.display = ''; // Show all specimens
    });
}

// Incoming specimen
function filterIncomingSpecimensBy(filterType) {
    var incomingSpecimens = document.querySelectorAll('#specimenInContainer .in-referral');
    var currentDate = new Date();

    switch (filterType) {
        case 'today':
            var today = new Date(currentDate);
            today.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingSpecimens(incomingSpecimens, today, currentDate);
            break;
        case 'last_week':
            var lastWeek = new Date(currentDate);
            lastWeek.setDate(lastWeek.getDate() - 7);
            lastWeek.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingSpecimens(incomingSpecimens, lastWeek, currentDate);
            break;
        case 'last_month':
            var lastMonth = new Date(currentDate);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            lastMonth.setHours(0, 0, 0, 0); // Set time to the beginning of the day
            filterIncomingSpecimens(incomingSpecimens, lastMonth, currentDate);
            break;
        case 'all_time':
            showAllIncomingSpecimens(incomingSpecimens);
            break;
        default:
            break;
    }
}

function filterIncomingSpecimens(incomingSpecimens, startDate, endDate) {
    incomingSpecimens.forEach(function(incomingSpecimen) {
        var specimenDate = new Date(incomingSpecimen.dataset.date); // Parse specimen date from dataset
        if (specimenDate >= startDate && specimenDate <= endDate) {
            incomingSpecimen.style.display = ''; // Show incoming specimen
        } else {
            incomingSpecimen.style.display = 'none'; // Hide incoming specimen
        }
    });
}

function showAllIncomingSpecimens(incomingSpecimens) {
    incomingSpecimens.forEach(function(incomingSpecimen) {
        incomingSpecimen.style.display = ''; // Show all incoming specimens
    });
}




