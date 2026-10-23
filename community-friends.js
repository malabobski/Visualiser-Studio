// This module runs in the main process, behind the existing Community bridge.
function friendError(error) {
  if (['PGRST202', '42883', '42P01', 'PGRST205'].includes(error?.code)) return 'Friends needs its database update. Run the new friends setup file in Supabase.';
  if (error?.code === 'P0001') return error.message;
  return 'Couldn’t update your friends. Check your connection and try again.';
}
function friendHandlers(client, getUser) {
  async function rpc(name, input) {
    if (!getUser()) throw new Error('Sign in to use friends.');
    const { data, error } = await client.rpc(name, input);
    if (error) throw new Error(friendError(error));
    return data;
  }
  const friends = async () => ({ relationships: await rpc('community_friends') || [] });
  return {
    friends,
    searchPeople: async input => {
      const term = String(input || '').trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(term)) throw new Error('Enter at least 3 letters, numbers or underscores from a username.');
      const [people, current] = await Promise.all([
        rpc('community_search_people', { search_term: term }),
        friends()
      ]);
      return { people: people || [], ...current };
    },
    sendRequest: async input => {
      const username = String(input || '').trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Choose a valid username.');
      await rpc('community_send_request', { target_username: username });
      return friends();
    },
    friendAction: async input => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.id || '') || !['accept','decline','cancel','remove'].includes(input?.action)) throw new Error('Choose an available friend action.');
      await rpc('community_friend_action', { request_id: input.id, requested_action: input.action });
      return friends();
    }
  };
}
module.exports = { friendHandlers };
