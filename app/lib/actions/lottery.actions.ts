'use server'

export async function enterLottery(formData: FormData) {
    const name = formData.get('name' as string)
    const email = formData.get('email' as string)


    // Server-side validation
    if (!name || !email || typeof email !== 'string' || !email.includes('@')) {
        return {
            success: false,
            error: 'Invalid input'
        }
    }

    // TODO: Save to database
    // await db.collection('entries').add({ name, email, date: new Date() })

    return { success: true }
}