(() => {
  const screen = document.getElementById('screen-community');
  if (!screen) return;
  const el = name => document.getElementById('community' + name);
  let state = {}, busy = false, draft = false;
  const bridge = window.community;
  let relationships = [], people = [], searched = false, loaded = false, removing = '', friendTab = 'friends';
  let tabTimer, profileCloseTimer, profilePrompted = false;
  let refreshingFriends = false, friendEpoch = 0;
  let startupRequestsChecked = false;
  const profileDialog = el('ProfileDialog');
  const confirmDialog = el('ConfirmDialog');
  let confirmResolve;
  const reducedMotion = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const friendActions = new Set(['friends', 'searchPeople', 'sendRequest', 'friendAction']);
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function button(text, onClick, primary = false) {
    const element = node('button', text, primary ? 'community-primary' : '');
    element.type = 'button'; element.addEventListener('click', onClick);
    return element;
  }
  function selectTab(name, animate = true) {
    const panel = key => el(key[0].toUpperCase() + key.slice(1) + 'Panel');
    const next = panel(name);
    if (friendTab === name && !next.hidden && !tabTimer) return;
    clearTimeout(tabTimer); tabTimer = null;
    const previous = ['friends', 'requests', 'add'].map(panel).find(item => !item.hidden);
    friendTab = name;
    screen.querySelectorAll('[data-friend-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.friendTab === name)));
    el('PanelTitle').textContent = {friends:'Friend list', requests:'Friend requests', add:'Add a friend'}[name];
    ['friends', 'requests', 'add'].map(panel).forEach(item => { item.classList.remove('is-entering', 'is-leaving'); item.inert = false; });
    const reveal = () => {
      tabTimer = null;
      for (const key of ['friends', 'requests', 'add']) panel(key).hidden = name !== key;
      if (animate && !reducedMotion()) next.classList.add('is-entering');
      if (name === 'add') el('PeopleQuery').focus({preventScroll:true});
    };
    if (animate && !reducedMotion() && previous && previous !== next) {
      previous.inert = true; previous.classList.add('is-leaving');
      tabTimer = setTimeout(reveal, 130);
    } else reveal();
  }
  function openProfile() {
    if (!state.signedIn || screen.hidden) return;
    clearTimeout(profileCloseTimer);
    profileDialog.classList.remove('is-closing');
    usernameLock();
    if (!profileDialog.open) profileDialog.showModal();
  }
  function closeProfile(immediate = false) {
    clearTimeout(profileCloseTimer);
    if (!profileDialog.open) return;
    const finish = () => { profileDialog.close(); profileDialog.classList.remove('is-closing'); };
    if (immediate || reducedMotion()) finish();
    else { profileDialog.classList.add('is-closing'); profileCloseTimer = setTimeout(finish, 180); }
  }
  function promptProfile() {
    if (state.signedIn && !state.profile?.username && !profilePrompted && !screen.hidden) {
      profilePrompted = true; openProfile();
    }
  }
  function status(text) {
    el('Status').textContent = text;
    el('ProfileStatus').textContent = text;
  }
  function confirmCommunity(title, text, label, cancel = 'Cancel') {
    if (confirmDialog.open) return Promise.resolve(false);
    el('ConfirmTitle').textContent = title; el('ConfirmText').textContent = text;
    el('ConfirmAccept').textContent = label; el('ConfirmCancel').textContent = cancel;
    confirmDialog.classList.remove('is-closing'); confirmDialog.showModal();
    el('ConfirmCancel').focus();
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function finishConfirm(accepted) {
    if (!confirmResolve || confirmDialog.classList.contains('is-closing')) return;
    const finish = () => { confirmDialog.close(); confirmDialog.classList.remove('is-closing'); const resolve = confirmResolve; confirmResolve = null; resolve(accepted); };
    if (reducedMotion()) finish(); else { confirmDialog.classList.add('is-closing'); setTimeout(finish, 180); }
  }
  window.CommunityUI = { get: () => state, confirm: confirmCommunity };
  function usernameLock() {
    const available = new Date(state.profile?.username_change_available_at || 0);
    const locked = available.getTime() > Date.now();
    el('Username').readOnly = locked;
    el('UsernameHint').textContent = locked
      ? `You can change your username again on ${available.toLocaleString(undefined, {dateStyle:'medium',timeStyle:'short'})}.`
      : '3–24 lowercase letters, numbers or underscores. Changes are limited to once a month.';
  }
  function personRow(person, relationship, isSearch = false) {
    const row = node('div', undefined, 'community-person');
    const info = node('div', undefined, 'community-person-info');
    info.append(node('strong', person.display_name), node('span', '@' + person.username));
    if (person.bio) info.append(node('p', person.bio));
    row.append(node('div', (person.display_name || '◈').slice(0,1).toUpperCase(), 'community-avatar'), info);
    const actions = node('div', undefined, 'community-person-actions');
    const change = actionName => { removing = ''; action('friendAction', { id: relationship.id, action: actionName }); };
    if (isSearch && person.username === state.profile?.username) {
      const self = button('Add friend', () => {}, true);
      self.setAttribute('aria-disabled', 'true');
      self.classList.add('community-self-add');
      self.title = 'you cant add yourself, silly!';
      self.dataset.hint = 'you cant add yourself, silly!';
      actions.append(self);
      info.append(node('span', 'You', 'community-person-self'));
    } else if (!relationship) actions.append(button('Add friend', () => action('sendRequest', person.username), true));
    else if (relationship.status === 'accepted') {
      if (isSearch) actions.append(node('span', 'Friends', 'community-person-tag'));
      else if (removing === relationship.id) actions.append(button('Confirm removal', () => change('remove')), button('Keep friend', () => { removing = ''; renderFriends(); }));
      else actions.append(button('Remove friend', () => { removing = relationship.id; renderFriends(); }));
    } else if (relationship.direction === 'incoming') actions.append(button('Accept', () => change('accept'), true), button('Decline', () => change('decline')));
    else actions.append(node('span', 'Request sent', 'community-person-tag'), button('Cancel', () => change('cancel')));
    row.append(actions);
    return row;
  }
  function renderFriends() {
    const accepted = relationships.filter(item => item.status === 'accepted');
    const incoming = relationships.filter(item => item.status === 'pending' && item.direction === 'incoming');
    const outgoing = relationships.filter(item => item.status === 'pending' && item.direction === 'outgoing');
    if (loaded && !startupRequestsChecked) {
      startupRequestsChecked = true;
      if (incoming.length) window.AppNotifications?.show({
        title:'Friend requests',symbol:'!',
        message:`${incoming.length} friend ${incoming.length===1?'request':'requests'} while you were gone! So popular!`,
        duration:8000,
        onClick:() => {
          closeProfile(true);
          document.querySelector('[data-screen="community"]')?.click();
          selectTab('requests');
        }
      });
    }
    el('FriendsCount').textContent = accepted.length;
    el('RequestsCount').textContent = incoming.length;
    el('RequestsCount').hidden = !incoming.length;
    el('SidebarCount').textContent = incoming.length > 99 ? '99+' : incoming.length;
    el('SidebarCount').hidden = !incoming.length;
    const communityNav = document.querySelector('[data-screen="community"]');
    const sidebarLabel = incoming.length ? `Community, ${incoming.length} incoming friend ${incoming.length===1?'request':'requests'}` : 'Community';
    communityNav.setAttribute('aria-label', sidebarLabel);
    communityNav.dataset.hint = sidebarLabel;
    el('RequestsTab').setAttribute('aria-label', incoming.length ? `Friend requests, ${incoming.length} incoming` : 'Friend requests');
    const fill = (name, items, empty) => {
      const list = el(name);
      const snapshot = JSON.stringify([items, loaded, name === 'FriendsList' ? removing : '']);
      if (list.dataset.snapshot === snapshot) return false;
      list.dataset.snapshot = snapshot;
      list.replaceChildren(...items.map(item => personRow(item, item)));
      if (!items.length) list.append(node('p', loaded ? empty : 'Loading your people…', 'community-empty'));
      return true;
    };
    const friendsChanged = fill('FriendsList', accepted, '');
    if (friendsChanged && loaded && !accepted.length) {
      const empty = node('div', undefined, 'community-empty-state');
      const icon = el('FriendsTab').querySelector('svg').cloneNode(true);
      icon.removeAttribute('class'); icon.setAttribute('width', '32'); icon.setAttribute('height', '32');
      empty.append(icon, node('strong', 'No friends yet'), node('p', 'Bring someone along for the music.'), button('Add friend', () => selectTab('add'), true));
      el('FriendsList').replaceChildren(empty);
    }
    fill('IncomingList', incoming, 'You’re all caught up.');
    fill('OutgoingList', outgoing, 'No requests waiting for a reply.');
    const peopleSnapshot = JSON.stringify([people, people.map(person => relationships.find(item => item.person_id === person.id)), searched, state.profile?.username]);
    if (el('PeopleResults').dataset.snapshot !== peopleSnapshot) {
      el('PeopleResults').dataset.snapshot = peopleSnapshot;
      el('PeopleResults').replaceChildren(...people.map(person => personRow(person, relationships.find(item => item.person_id === person.id), true)));
      if (searched && !people.length) el('PeopleResults').append(node('p', 'No matching usernames. Check the spelling and try again.', 'community-empty'));
    }
  }
  function render(next, force = false) {
    if (next.error) { status(next.error); return; }
    const changedUser = state.signedIn !== next.signedIn;
    state = next;
    el('Friends').hidden = !state.signedIn;
    if (changedUser) {
      friendEpoch++;
      relationships = []; people = []; searched = false; loaded = false; removing = '';
      profilePrompted = false;
      el('Announce').checked = false;
      selectTab('friends', false);
      el('PeopleQuery').value = ''; el('FriendsStatus').textContent = '';
      renderFriends();
      if (state.signedIn) setTimeout(() => refreshFriends(), 0);
    }
    el('Welcome').hidden = !!state.signedIn;
    el('Profile').hidden = !state.signedIn;
    if (!state.signedIn) closeProfile(true);
    el('SignIn').hidden = !!state.waiting;
    el('Cancel').hidden = !state.waiting;
    el('AuthMethods').hidden = !!state.waiting;
    status(state.message || (state.waiting ? 'Your browser is open. Finish signing in there, then come back here.' : ''));
    el('Refresh').hidden = !state.signedIn || !state.message || state.message === 'Profile saved.';
    if (state.signedIn) {
      const profile = state.profile || {};
      el('Name').textContent = profile.display_name || 'Make it yours';
      el('Initial').textContent = (profile.display_name || '◈').slice(0,1).toUpperCase();
      el('AccountName').textContent = profile.display_name || 'Your profile';
      el('AccountUsername').textContent = profile.username ? '@' + profile.username : 'Finish your profile';
      el('AccountInitial').textContent = el('Initial').textContent;
      usernameLock();
      if (force || changedUser || !draft) {
        el('Username').value = profile.username || '';
        el('DisplayName').value = profile.display_name || '';
        el('Bio').value = profile.bio || '';
        draft = false;
      }
      if (!state.remembersSignIn && !state.message) status('You’re signed in for this session. Secure sign-in storage isn’t available on this device.');
      promptProfile();
    }
    el('AnnounceRow').hidden = !state.signedIn || !!state.profile?.created_at;
    window.dispatchEvent(new CustomEvent('community-account', {detail:state}));
  }
  async function action(name, value) {
    if (busy) return;
    friendEpoch++;
    busy = true;
    screen.querySelectorAll('button').forEach(button => button.disabled = true);
    try {
      const result = await bridge[name](value);
      if (friendActions.has(name)) {
        if (result.error) { el('FriendsStatus').textContent = result.error; return; }
        if (result.relationships) { relationships = result.relationships; loaded = true; }
        if (result.people) { people = result.people; searched = true; }
        el('FriendsStatus').textContent = name === 'sendRequest' ? 'Friend request sent.' : name === 'friendAction' ? ({accept:'You’re now friends.',decline:'Request declined.',cancel:'Request cancelled.',remove:'Friend removed.'})[value.action] : '';
        renderFriends();
      } else {
        render(result, name === 'saveProfile' && !result.error);
        if (name === 'saveProfile' && !result.error) closeProfile();
      }
    } catch {
      if (friendActions.has(name)) el('FriendsStatus').textContent = 'Couldn’t connect. Please try again.';
      else status('Couldn’t connect. Please try again.');
    }
    finally { busy = false; screen.querySelectorAll('button').forEach(button => button.disabled = false); }
  }
  if (!bridge) {
    el('SignIn').disabled = true;
    el('GoogleSignIn').disabled = true;
    el('Status').textContent = 'Open the desktop app to use Community.';
    return;
  }
  let validationFocusPending=false;
  screen.addEventListener('invalid',event=>{
    const field=event.target;
    if(!field.closest('form'))return;
    event.preventDefault();
    const target=field.closest('#communityPeopleSearch')?el('FriendsStatus'):
      field.closest('#communityPostForm')?el('FeedStatus'):el('ProfileStatus');
    const message=field.id==='communityPeopleQuery'
      ? (field.validity.valueMissing?'Enter a username to search.':'Enter at least 3 characters from a username.')
      : field.id==='communityUsername'
        ? 'Choose a username with 3–24 lowercase letters, numbers or underscores.'
        : field.id==='communityDisplayName'?'Enter a display name.':'Check this field and try again.';
    target.textContent=message;target.dataset.validationFor=field.id;
    field.setAttribute('aria-invalid','true');
    if(!validationFocusPending){validationFocusPending=true;requestAnimationFrame(()=>{field.focus();validationFocusPending=false;});}
  },true);
  screen.addEventListener('input',event=>{
    const field=event.target;
    if(field.getAttribute('aria-invalid')!=='true')return;
    field.removeAttribute('aria-invalid');
    for(const name of ['FriendsStatus','FeedStatus','ProfileStatus']){
      const target=el(name);if(target.dataset.validationFor===field.id){target.textContent='';delete target.dataset.validationFor;}
    }
  });
  el('SignIn').addEventListener('click', () => action('signIn','discord'));
  el('GoogleSignIn').addEventListener('click', () => action('signIn','google'));
  el('Cancel').addEventListener('click', () => action('cancel'));
  el('SignOut').addEventListener('click', async () => {
    if (await confirmCommunity('Log out?', 'Are you sure you want to log out of your Community account?', 'Log out', 'Stay signed in')) action('signOut');
  });
  el('ConfirmAccept').addEventListener('click', () => finishConfirm(true));
  el('ConfirmCancel').addEventListener('click', () => finishConfirm(false));
  confirmDialog.addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
  confirmDialog.addEventListener('click', event => {
    if (event.target !== confirmDialog) return;
    const r = confirmDialog.getBoundingClientRect();
    if (event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) finishConfirm(false);
  });
  el('Refresh').addEventListener('click', () => action('refresh'));
  el('FriendsRefresh').addEventListener('click', () => action('friends'));
  el('EditProfile').addEventListener('click', openProfile);
  el('ProfileClose').addEventListener('click', () => closeProfile());
  profileDialog.addEventListener('cancel', event => { event.preventDefault(); closeProfile(); });
  profileDialog.addEventListener('click', event => {
    if (event.target !== profileDialog) return;
    const rect = profileDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeProfile();
  });
  screen.querySelectorAll('[data-friend-tab]').forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.friendTab)));
  el('PeopleSearch').addEventListener('submit', event => { event.preventDefault(); action('searchPeople', el('PeopleQuery').value); });
  const refreshFriends = async () => {
    if (document.hidden || !state.signedIn || busy || profileDialog.open || refreshingFriends || removing) return;
    refreshingFriends = true;
    const epoch = friendEpoch;
    try {
      const result = await bridge.friends();
      if (epoch !== friendEpoch || !state.signedIn) return;
      if (result.error) { if (!loaded) el('FriendsStatus').textContent = result.error; return; }
      if (!loaded || JSON.stringify(relationships) !== JSON.stringify(result.relationships)) {
        relationships = result.relationships || []; loaded = true;
        const content = screen.querySelector('.community-friends-content'), scroll = content.scrollTop;
        renderFriends(); content.scrollTop = scroll;
      }
    } catch { /* Keep existing content and retry on the next background check. */ }
    finally { refreshingFriends = false; }
  };
  new MutationObserver(() => { if (screen.hidden) closeProfile(true); else { refreshFriends(); promptProfile(); } }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', refreshFriends);
  window.addEventListener('focus', refreshFriends);
  setInterval(refreshFriends, 30000);
  el('Profile').addEventListener('input', () => { draft = true; });
  el('Profile').addEventListener('submit', event => {
    event.preventDefault();
    action('saveProfile', { username: el('Username').value, display_name: el('DisplayName').value, bio: el('Bio').value, announce:!state.profile?.created_at && el('Announce').checked });
  });
  bridge.onChange(next => render(next));
  bridge.onReturn?.(() => document.querySelector('[data-screen="community"]')?.click());
  action('get');
})();
