(function () {
    const historyPanel = document.getElementById('historyPanel');
    let currentTab = 't1';

    function render() {
        WorkHistory.renderHistoryPanel(historyPanel, currentTab);
    }

    document.querySelectorAll('.history-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.history-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.task;
            render();
        });
    });

    const modal = document.getElementById('apiModal');
    const input = document.getElementById('apiKeyInput');
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) input.value = savedKey;

    document.getElementById('apiKeyBtn').addEventListener('click', () => modal.classList.add('open'));
    document.getElementById('apiCancel').addEventListener('click', () => modal.classList.remove('open'));
    document.getElementById('apiSave').addEventListener('click', () => {
        const v = input.value.trim();
        if (v) localStorage.setItem('gemini_api_key', v);
        else localStorage.removeItem('gemini_api_key');
        modal.classList.remove('open');
    });

    render();
})();
