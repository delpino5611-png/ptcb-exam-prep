/*
 * PTCB Exam Prep - Application Logic
 * Copyright 2026 Michael Mordetsky. All Rights Reserved.
 */

// ---- Access Code (change this to set your Etsy buyers' password) ----
const ACCESS_CODE = 'PTCB2026';

// ---- State ----
let userName = '';
let currentMode = 'dashboard';
let feedbackMode = 'instant';
let currentQuestionIndex = 0;
let filteredQuestions = [];
let selectedAnswer = null;
let sessionCorrect = 0;
let sessionIncorrect = 0;
let examAnswers = [];
let timerInterval = null;
let timerSeconds = 0;

let learningData = {
    totalAttempted: 0,
    totalCorrect: 0,
    topicPerformance: {},
    questionHistory: {},
    weakTopics: [],
    streak: 0,
    lastStudyDate: null
};

// ---- Initialize ----
function init() {
    // Check access
    if (sessionStorage.getItem('ptcbAccess') === 'granted') {
        document.getElementById('passwordScreen').classList.add('hidden');
        loadLearningData();
        if (userName) {
            document.getElementById('nameInput').value = userName;
            enterMainApp();
        } else {
            document.getElementById('welcomeScreen').classList.remove('hidden');
        }
    }

    // Enter key support
    document.getElementById('accessCodeInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') verifyAccess();
    });
    document.getElementById('nameInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') startApp();
    });

    // Dark mode: check saved preference or system preference
    initDarkMode();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function() {});
    }
}

// ---- Access Gate ----
function verifyAccess() {
    var code = document.getElementById('accessCodeInput').value.trim();
    if (code === ACCESS_CODE) {
        sessionStorage.setItem('ptcbAccess', 'granted');
        document.getElementById('passwordScreen').classList.add('hidden');
        document.getElementById('accessError').classList.add('hidden');
        loadLearningData();
        if (userName) {
            enterMainApp();
        } else {
            document.getElementById('welcomeScreen').classList.remove('hidden');
        }
    } else {
        document.getElementById('accessError').classList.remove('hidden');
        document.getElementById('accessCodeInput').value = '';
        document.getElementById('accessCodeInput').focus();
    }
}

// ---- Dark Mode ----
function initDarkMode() {
    var saved = localStorage.getItem('ptcbDarkMode');
    if (saved === 'true' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateDarkModeIcon(true);
    }
}

function toggleDarkMode() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('ptcbDarkMode', 'false');
        updateDarkModeIcon(false);
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('ptcbDarkMode', 'true');
        updateDarkModeIcon(true);
    }
}

function updateDarkModeIcon(isDark) {
    var el = document.getElementById('darkModeIcon');
    if (el) el.innerHTML = isDark ? '&#9788;' : '&#9790;';
}

// ---- App Start ----
function startApp() {
    userName = document.getElementById('nameInput').value.trim();
    if (!userName) {
        document.getElementById('nameInput').focus();
        return;
    }

    // Streak tracking
    var today = new Date().toDateString();
    if (learningData.lastStudyDate) {
        var lastDate = new Date(learningData.lastStudyDate).toDateString();
        var yesterday = new Date(Date.now() - 86400000).toDateString();
        if (lastDate !== today && lastDate !== yesterday) {
            learningData.streak = 0;
        }
    }
    learningData.lastStudyDate = new Date().toISOString();
    saveLearningData();
    enterMainApp();
}

function enterMainApp() {
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = userName;
    updateDashboard();
    updateMasteryTracker();
    generateAdaptiveSuggestions();
    updateLastStudyInfo();
}

// ---- Mode Navigation ----
function setMode(mode, btnEl) {
    currentMode = mode;
    stopTimer();

    // Update active button
    document.querySelectorAll('.mode-btn').forEach(function(btn) { btn.classList.remove('active'); });
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        var match = document.querySelector('.mode-btn[data-mode="' + mode + '"]');
        if (match) match.classList.add('active');
    }

    // Toggle views
    document.getElementById('dashboardView').classList.toggle('hidden', mode !== 'dashboard');
    document.getElementById('categoriesView').classList.toggle('hidden', mode !== 'categories');
    document.getElementById('quizView').classList.toggle('hidden',
        mode === 'dashboard' || mode === 'categories');

    if (mode === 'adaptive') {
        startAdaptivePractice();
    } else if (mode === 'test') {
        startFullTest();
    } else if (mode === 'dashboard') {
        updateDashboard();
        updateMasteryTracker();
        generateAdaptiveSuggestions();
        updateLastStudyInfo();
    }
}

// ---- Feedback Mode ----
function setFeedbackMode(mode, btnEl) {
    feedbackMode = mode;
    document.querySelectorAll('.toggle-btn').forEach(function(btn) { btn.classList.remove('active'); });
    if (btnEl) btnEl.classList.add('active');
}

// ---- Category Practice ----
function startCategoryPractice(category) {
    if (category === 'all') {
        filteredQuestions = allQuestions.slice();
    } else if (category === 'Calculations') {
        filteredQuestions = allQuestions.filter(function(q) {
            var text = (q.question + ' ' + q.explanation).toLowerCase();
            return /calculate|mg\/kg|milliliter|gtt\/min|alligation|step 1:|step 2:|formula:|÷|×|flow rate|days supply.*\d/.test(text);
        });
    } else {
        filteredQuestions = allQuestions.filter(function(q) { return q.domain === category; });
    }

    if (filteredQuestions.length === 0) {
        alert('No questions available for this category.');
        return;
    }

    shuffle(filteredQuestions);
    resetSession();
    document.getElementById('categoriesView').classList.add('hidden');
    document.getElementById('quizView').classList.remove('hidden');
    displayQuestion();
}

// ---- Adaptive Practice ----
function startAdaptivePractice() {
    var weakTopics = identifyWeakTopics();
    if (weakTopics.length === 0) {
        filteredQuestions = allQuestions.slice();
    } else {
        filteredQuestions = allQuestions.filter(function(q) { return weakTopics.indexOf(q.domain) !== -1; });
    }
    shuffle(filteredQuestions);
    resetSession();
    document.getElementById('quizView').classList.remove('hidden');
    displayQuestion();
}

// ---- Full Test ----
function startFullTest() {
    filteredQuestions = allQuestions.slice();
    shuffle(filteredQuestions);
    resetSession();
    document.getElementById('quizView').classList.remove('hidden');

    // Start timer: ~1.2 min per question
    var totalMinutes = Math.round(filteredQuestions.length * 1.2);
    startTimer(totalMinutes * 60);

    displayQuestion();
}

// ---- Timer ----
function startTimer(seconds) {
    timerSeconds = seconds;
    var display = document.getElementById('timerDisplay');
    display.classList.remove('hidden');
    display.classList.remove('warning');
    updateTimerDisplay();

    timerInterval = setInterval(function() {
        timerSeconds--;
        if (timerSeconds <= 0) {
            stopTimer();
            timerSeconds = 0;
            updateTimerDisplay();
            // Auto-finish
            if (feedbackMode === 'exam' && examAnswers.length > 0) {
                showResults();
            } else {
                showSessionComplete();
            }
            return;
        }
        // Warning at 10 minutes
        if (timerSeconds <= 600) {
            display.classList.add('warning');
        }
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    var display = document.getElementById('timerDisplay');
    if (display) {
        display.classList.add('hidden');
        display.classList.remove('warning');
    }
}

function updateTimerDisplay() {
    var min = Math.floor(timerSeconds / 60);
    var sec = timerSeconds % 60;
    var text = (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
    document.getElementById('timerText').textContent = text;
}

// ---- Quiz Logic ----
function resetSession() {
    currentQuestionIndex = 0;
    sessionCorrect = 0;
    sessionIncorrect = 0;
    examAnswers = [];
    selectedAnswer = null;
}

function displayQuestion() {
    if (currentQuestionIndex >= filteredQuestions.length) {
        if (feedbackMode === 'exam') {
            showResults();
        } else {
            showSessionComplete();
        }
        return;
    }

    var question = filteredQuestions[currentQuestionIndex];
    selectedAnswer = null;

    document.getElementById('domainBadge').textContent = question.domain;
    document.getElementById('questionText').textContent = question.question;
    document.getElementById('questionCounter').textContent =
        'Question ' + (currentQuestionIndex + 1) + ' of ' + filteredQuestions.length;

    var container = document.getElementById('optionsContainer');
    container.innerHTML = '';

    question.options.forEach(function(option, index) {
        var letter = String.fromCharCode(65 + index);
        var div = document.createElement('div');
        div.className = 'option';
        div.innerHTML = '<span class="option-letter">' + letter + ')</span>' + option;
        div.onclick = function() { selectAnswer(letter, div); };
        container.appendChild(div);
    });

    document.getElementById('explanationBox').classList.remove('show');
    document.getElementById('checkBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
    document.getElementById('finishBtn').classList.add('hidden');

    if (feedbackMode === 'exam' && currentQuestionIndex === filteredQuestions.length - 1) {
        document.getElementById('checkBtn').textContent = 'Submit & See Results';
    } else {
        document.getElementById('checkBtn').textContent = feedbackMode === 'instant' ? 'Check Answer' : 'Submit Answer';
    }

    updateProgress();
}

function selectAnswer(letter, element) {
    document.querySelectorAll('.option').forEach(function(opt) { opt.classList.remove('selected'); });
    element.classList.add('selected');
    selectedAnswer = letter;
}

function handleAnswer() {
    if (!selectedAnswer) {
        alert('Please select an answer!');
        return;
    }

    var question = filteredQuestions[currentQuestionIndex];
    var isCorrect = selectedAnswer === question.correct;

    if (feedbackMode === 'instant') {
        document.querySelectorAll('.option').forEach(function(option, index) {
            var letter = String.fromCharCode(65 + index);
            option.onclick = null;
            if (letter === question.correct) {
                option.classList.add('correct');
            } else if (letter === selectedAnswer) {
                option.classList.add('incorrect');
            }
        });

        if (isCorrect) { sessionCorrect++; learningData.streak++; }
        else { sessionIncorrect++; learningData.streak = 0; }

        trackAnswer(question, isCorrect);
        document.getElementById('explanationText').textContent = question.explanation;
        document.getElementById('explanationBox').classList.add('show');
        document.getElementById('checkBtn').classList.add('hidden');
        document.getElementById('nextBtn').classList.remove('hidden');
        updateSessionScores();
        saveLearningData();
    } else {
        examAnswers.push({ question: question, userAnswer: selectedAnswer, isCorrect: isCorrect });
        if (isCorrect) { sessionCorrect++; } else { sessionIncorrect++; }
        trackAnswer(question, isCorrect);
        saveLearningData();
        updateSessionScores();

        // Last question in exam mode -> show results
        if (currentQuestionIndex === filteredQuestions.length - 1) {
            showResults();
        } else {
            currentQuestionIndex++;
            displayQuestion();
        }
    }
}

function nextQuestion() {
    currentQuestionIndex++;
    displayQuestion();
}

// ---- Results ----
function showResults() {
    stopTimer();
    document.getElementById('resultsModal').classList.remove('hidden');

    var total = sessionCorrect + sessionIncorrect;
    var percent = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;

    document.getElementById('resultsStats').innerHTML =
        '<div class="score-display">' +
        '<div class="score-item"><div class="score-value">' + sessionCorrect + '</div><div class="score-label">Correct</div></div>' +
        '<div class="score-item"><div class="score-value">' + sessionIncorrect + '</div><div class="score-label">Incorrect</div></div>' +
        '<div class="score-item"><div class="score-value">' + percent + '%</div><div class="score-label">Score</div></div>' +
        '</div>';

    var list = document.getElementById('resultsList');
    list.innerHTML = '';

    examAnswers.forEach(function(answer, index) {
        var item = document.createElement('div');
        item.className = 'result-item ' + (answer.isCorrect ? 'correct' : 'incorrect');
        item.innerHTML =
            '<strong>Q' + (index + 1) + ': ' + (answer.isCorrect ? 'Correct' : 'Incorrect') + '</strong><br>' +
            '<small>' + answer.question.question.substring(0, 80) + '...</small><br>' +
            '<small>Your answer: ' + answer.userAnswer + ' | Correct: ' + answer.question.correct + '</small>';
        item.onclick = function() { showDetailedResult(answer); };
        list.appendChild(item);
    });
}

function showDetailedResult(answer) {
    alert('Question: ' + answer.question.question +
        '\n\nYour Answer: ' + answer.userAnswer +
        '\nCorrect Answer: ' + answer.question.correct +
        '\n\nExplanation: ' + answer.question.explanation);
}

function closeResults() {
    document.getElementById('resultsModal').classList.add('hidden');
    setMode('dashboard');
}

function retryQuiz() {
    document.getElementById('resultsModal').classList.add('hidden');
    shuffle(filteredQuestions);
    resetSession();
    displayQuestion();
    if (currentMode === 'test') {
        var totalMinutes = Math.round(filteredQuestions.length * 1.2);
        startTimer(totalMinutes * 60);
    }
}

function showSessionComplete() {
    stopTimer();
    var total = sessionCorrect + sessionIncorrect;
    var percent = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;
    alert('Session Complete!\n\nCorrect: ' + sessionCorrect +
        '\nIncorrect: ' + sessionIncorrect +
        '\nScore: ' + percent + '%\n\nGreat work, ' + userName + '!');
    setMode('dashboard');
}

// ---- Tracking ----
function trackAnswer(question, isCorrect) {
    learningData.totalAttempted++;
    if (isCorrect) learningData.totalCorrect++;

    if (!learningData.topicPerformance[question.domain]) {
        learningData.topicPerformance[question.domain] = { attempted: 0, correct: 0 };
    }
    learningData.topicPerformance[question.domain].attempted++;
    if (isCorrect) learningData.topicPerformance[question.domain].correct++;

    if (!learningData.questionHistory[question.number]) {
        learningData.questionHistory[question.number] = [];
    }
    learningData.questionHistory[question.number].push(isCorrect);
    learningData.lastStudyDate = new Date().toISOString();
}

// ---- UI Updates ----
function updateProgress() {
    var progress = ((currentQuestionIndex + 1) / filteredQuestions.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
}

function updateSessionScores() {
    document.getElementById('sessionCorrect').textContent = sessionCorrect;
    document.getElementById('sessionIncorrect').textContent = sessionIncorrect;
    var total = sessionCorrect + sessionIncorrect;
    var percent = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;
    document.getElementById('sessionPercent').textContent = percent + '%';
}

function updateDashboard() {
    document.getElementById('totalQuestionsCount').textContent = allQuestions.length;
    document.getElementById('completedCount').textContent = learningData.totalAttempted;
    var accuracy = learningData.totalAttempted > 0
        ? Math.round((learningData.totalCorrect / learningData.totalAttempted) * 100) : 0;
    document.getElementById('accuracyDisplay').textContent = accuracy + '%';
    document.getElementById('streakCount').textContent = learningData.streak;
}

function updateMasteryTracker() {
    var domains = ['Medications', 'Federal Requirements', 'Order Entry and Processing', 'Patient Safety and Quality Assurance', 'Mixed'];
    var grid = document.getElementById('masteryGrid');
    grid.innerHTML = '';

    domains.forEach(function(domain) {
        var perf = learningData.topicPerformance[domain] || { attempted: 0, correct: 0 };
        var accuracy = perf.attempted > 0 ? (perf.correct / perf.attempted) * 100 : 0;

        var level = 'learning';
        if (accuracy >= 80 && perf.attempted >= 20) level = 'mastered';
        else if (accuracy >= 60 && perf.attempted >= 10) level = 'practicing';

        var levelLabel = level === 'mastered' ? 'Mastered' : level === 'practicing' ? 'Practicing' : 'Learning';

        var card = document.createElement('div');
        card.className = 'mastery-card ' + level;
        card.onclick = function() { startCategoryPractice(domain); };
        card.innerHTML =
            '<div class="mastery-title">' + domain + '</div>' +
            '<div class="mastery-bar"><div class="mastery-fill" style="width:' + accuracy + '%"></div></div>' +
            '<div class="mastery-stats"><span>' + perf.attempted + ' attempted</span><span>' + Math.round(accuracy) + '% accuracy</span></div>' +
            '<div style="margin-top:6px;font-size:0.85em;color:var(--text-secondary)">' + levelLabel + '</div>';
        grid.appendChild(card);
    });
}

function generateAdaptiveSuggestions() {
    var weakTopics = identifyWeakTopics();
    var box = document.getElementById('adaptiveSuggestions');
    var list = document.getElementById('suggestionsList');

    if (weakTopics.length === 0) { box.classList.add('hidden'); return; }

    box.classList.remove('hidden');
    list.innerHTML = '';

    weakTopics.slice(0, 3).forEach(function(topic) {
        var perf = learningData.topicPerformance[topic];
        var accuracy = Math.round((perf.correct / perf.attempted) * 100);
        var item = document.createElement('div');
        item.className = 'suggestion-item';
        item.onclick = function() {
            setMode('categories');
            setTimeout(function() { startCategoryPractice(topic); }, 100);
        };
        item.innerHTML = '<strong>' + topic + '</strong><br><small>Current accuracy: ' + accuracy + '% - Practice more to improve!</small>';
        list.appendChild(item);
    });
}

function updateLastStudyInfo() {
    var el = document.getElementById('lastStudyInfo');
    if (!el) return;
    if (learningData.lastStudyDate) {
        var d = new Date(learningData.lastStudyDate);
        var unique = Object.keys(learningData.questionHistory).length;
        el.innerHTML = 'Last studied: ' + d.toLocaleDateString() + ' &bull; ' + unique + ' unique questions attempted';
    } else {
        el.textContent = 'Start studying to track your progress!';
    }
}

function identifyWeakTopics() {
    var weak = [];
    for (var topic in learningData.topicPerformance) {
        var perf = learningData.topicPerformance[topic];
        if (perf.attempted >= 5 && (perf.correct / perf.attempted) * 100 < 70) {
            weak.push(topic);
        }
    }
    weak.sort(function(a, b) {
        return (learningData.topicPerformance[a].correct / learningData.topicPerformance[a].attempted) -
               (learningData.topicPerformance[b].correct / learningData.topicPerformance[b].attempted);
    });
    return weak;
}

// ---- Data Persistence ----
function saveLearningData() {
    try {
        localStorage.setItem('ptcbLearningData', JSON.stringify({ userName: userName, learningData: learningData }));
    } catch (e) {
        console.warn('Could not save progress:', e);
    }
}

function loadLearningData() {
    try {
        var saved = localStorage.getItem('ptcbLearningData');
        if (saved) {
            var data = JSON.parse(saved);
            if (data.userName) userName = data.userName;
            if (data.learningData && typeof data.learningData.totalAttempted === 'number') {
                learningData = data.learningData;
                // Ensure all expected fields exist
                if (!learningData.topicPerformance) learningData.topicPerformance = {};
                if (!learningData.questionHistory) learningData.questionHistory = {};
                if (typeof learningData.streak !== 'number') learningData.streak = 0;
            }
        }
    } catch (e) {
        console.warn('Could not load saved data:', e);
        localStorage.removeItem('ptcbLearningData');
    }
}

// ---- Export / Import Progress ----
function exportProgress() {
    var data = {
        version: 1,
        userName: userName,
        learningData: learningData,
        exportDate: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ptcb-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importProgress(event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (!data.learningData || typeof data.learningData.totalAttempted !== 'number') {
                alert('Invalid progress file. Please select a valid PTCB progress export.');
                return;
            }
            if (!confirm('This will replace your current progress with the imported data. Continue?')) return;

            learningData = data.learningData;
            if (data.userName) userName = data.userName;
            saveLearningData();
            document.getElementById('userName').textContent = userName;
            updateDashboard();
            updateMasteryTracker();
            generateAdaptiveSuggestions();
            updateLastStudyInfo();
            alert('Progress imported successfully! (' + data.learningData.totalAttempted + ' answers restored)');
        } catch (err) {
            alert('Could not read file. Make sure it is a valid PTCB progress export.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ---- Reset ----
function resetProgress() {
    if (!confirm('Are you sure you want to reset ALL progress? This cannot be undone.')) return;
    if (!confirm('This will erase all your scores, streaks, and history. Continue?')) return;

    learningData = {
        totalAttempted: 0,
        totalCorrect: 0,
        topicPerformance: {},
        questionHistory: {},
        weakTopics: [],
        streak: 0,
        lastStudyDate: null
    };
    saveLearningData();
    updateDashboard();
    updateMasteryTracker();
    generateAdaptiveSuggestions();
    updateLastStudyInfo();
}

// ---- Utilities ----
function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
}

// ---- Start ----
init();
