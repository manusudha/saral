import { auth, currentUser } from '@clerk/nextjs/server';

export async function getSignedInUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const account = await currentUser();
  const fullName = account
    ? [account.firstName, account.lastName].filter(Boolean).join(' ').trim()
    : '';
  const displayName = fullName || account?.username || '';
  const mobile = account?.primaryPhoneNumber?.phoneNumber
    || account?.phoneNumbers?.find((phone) => phone.id === account.primaryPhoneNumberId)?.phoneNumber
    || '';

  return { id: userId, fullName: displayName, mobile };
}
